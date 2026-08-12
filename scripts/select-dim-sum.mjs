#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const catalogRepository = 'Ding-Ding-Projects/dim-sum-photos';
const targetRepository = process.env.GITHUB_REPOSITORY || 'Ding-Ding-Projects/material-winutil';

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: process.env,
  });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function catalog() {
  const value = ghJson([
    'api', '-H', 'Accept: application/vnd.github.raw+json',
    `repos/${catalogRepository}/contents/catalog/index.json`,
  ]);
  if (value.schemaVersion !== '1.0.0' || !Array.isArray(value.dishes)) {
    throw new Error(`Unsupported dim-sum catalog schema: ${value.schemaVersion ?? 'missing'}`);
  }
  return value;
}

function publishedAssets() {
  const releases = ghJson([
    'release', 'list', '--repo', catalogRepository, '--limit', '1000',
    '--json', 'tagName,isDraft,isPrerelease,publishedAt',
  ])
    .filter((release) => !release.isDraft && !release.isPrerelease && release.tagName.startsWith('catalog-v1'))
    .sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.tagName.localeCompare(right.tagName));

  const assets = new Map();
  const duplicates = new Set();
  for (const release of releases) {
    const detail = ghJson(['release', 'view', release.tagName, '--repo', catalogRepository, '--json', 'assets']);
    for (const asset of detail.assets ?? []) {
      if (asset.state !== 'uploaded' || asset.contentType !== 'image/png' || !(asset.size > 0)) continue;
      if (assets.has(asset.name)) {
        duplicates.add(asset.name);
        continue;
      }
      assets.set(asset.name, { ...asset, tag: release.tagName });
    }
  }
  for (const name of duplicates) assets.delete(name);
  return assets;
}

function usedDishIds() {
  const output = gh([
    'api', '--paginate', '--jq', '.[].body',
    `repos/${targetRepository}/releases?per_page=100`,
  ]);
  return new Set([...output.matchAll(/Dim sum catalog ID:\s*`?(hk-dish-\d+)`?/g)].map((match) => match[1]));
}

function select() {
  const data = catalog();
  const assets = publishedAssets();
  const used = usedDishIds();
  for (const dish of data.dishes) {
    const fileName = path.posix.basename(dish.image?.path ?? '');
    const asset = assets.get(fileName);
    if (!asset || used.has(dish.id)) continue;
    return {
      id: dish.id,
      codeName: `${dish.name.en} · ${dish.name.zhHant}`,
      imageUrl: asset.url,
      imageAltEn: dish.image.alt.en,
      imageAltYue: dish.image.alt.yue,
      catalogTag: asset.tag,
      assetName: asset.name,
    };
  }
  return null;
}

let result = null;
try {
  result = select();
} catch (error) {
  process.stderr.write(`Warning: dim-sum catalog discovery failed: ${error.message}\n`);
}

const output = process.argv[2];
const json = `${JSON.stringify(result, null, 2)}\n`;
if (output) writeFileSync(path.resolve(output), json, 'utf8');
else process.stdout.write(json);
