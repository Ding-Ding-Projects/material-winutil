import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import {
  createDimSumSurpriseCacheMetadata,
  DimSumStartupSurpriseLaunch,
  validateDimSumPublicAsset,
  validateDimSumSurpriseCacheMetadata,
  type DimSumPublicAssetProvenance,
  type DimSumStartupInput,
} from '../shared/dim-sum-surprise';
import type { DimSumStartupPresentation } from '../shared/types';

const PINNED_PUBLIC_ASSET: DimSumPublicAssetProvenance = Object.freeze({
  repository: 'Ding-Ding-Projects/dim-sum-photos',
  catalogSchemaVersion: '1.0.0',
  catalogRevision: 'f77ea1169db0bfc17365414c44ff495a823c6823',
  catalogUrl: 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/f77ea1169db0bfc17365414c44ff495a823c6823/catalog/index.json',
  dishId: 'hk-dish-0001',
  names: { English: 'Classic Har Gow', Yue: '蝦餃' },
  imageAlt: { English: 'Warm tea-house photograph of Classic Har Gow', Yue: '港式茶樓木枱上嘅蝦餃' },
  imagePath: 'images/hk-dish-0001-classic-har-gow.png',
  releaseTag: 'catalog-v1',
  releaseDraft: false,
  releasePrerelease: false,
  assetName: 'hk-dish-0001-classic-har-gow.png',
  assetUrl: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png',
  assetState: 'uploaded',
  contentType: 'image/png',
  assetSize: 2_406_444,
  sha256: 'sha256:c6ff2d32938f1e4c4ea685442f69227b8cd387f302ab8f8a62e8dd96c62b5ac0',
});

const CACHE_SCHEMA_VERSION = 1;
const REQUEST_TIMEOUT_MS = 15_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_PIXELS = 16 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const PUBLIC_ASSET_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

interface CacheDocument {
  schemaVersion: 1;
  metadata: ReturnType<typeof createDimSumSurpriseCacheMetadata>;
  provenance: DimSumPublicAssetProvenance;
}

export interface DimSumSurpriseServiceOptions {
  userDataDirectory: string;
  fetchAsset?: typeof fetch;
  randomDraw?: () => number;
  /** Test-only seam. Production always uses the immutable public-catalog record. */
  publicAsset?: DimSumPublicAssetProvenance;
  now?: () => Date;
}

function secureDraw(): number {
  return randomBytes(6).readUIntBE(0, 6) / 0x1_0000_0000_0000;
}

function validPng(bytes: Buffer): boolean {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return false;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > MAX_PNG_PIXELS) return false;
  try {
    const decoded = PNG.sync.read(bytes);
    return decoded.width === width && decoded.height === height && decoded.data.byteLength === width * height * 4;
  } catch {
    return false;
  }
}

function exactDigest(bytes: Buffer, expected: string): boolean {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}` === expected;
}

function safePublicRedirect(value: string, base: string): string | null {
  try {
    const next = new URL(value, base);
    if (next.protocol !== 'https:' || next.username || next.password || next.port || next.search || next.hash) return null;
    return PUBLIC_ASSET_HOSTS.has(next.hostname) ? next.href : null;
  } catch {
    return null;
  }
}

export class DimSumSurpriseService {
  private readonly directory: string;
  private readonly manifestFile: string;
  private readonly imageFile: string;
  private readonly firstRunMarker: string;
  private readonly fetchAsset: typeof fetch;
  private readonly launch: DimSumStartupSurpriseLaunch;
  private readonly publicAsset: DimSumPublicAssetProvenance;
  private readonly now: () => Date;

  constructor(options: DimSumSurpriseServiceOptions) {
    const asset = validateDimSumPublicAsset(options.publicAsset ?? PINNED_PUBLIC_ASSET);
    if (!asset) throw new TypeError('Dim-sum startup provenance is invalid.');
    this.directory = path.join(options.userDataDirectory, 'dim-sum-surprise');
    this.manifestFile = path.join(this.directory, 'cache.v1.json');
    this.imageFile = path.join(this.directory, 'photo.v1.png');
    this.firstRunMarker = path.join(this.directory, 'first-run-complete');
    this.fetchAsset = options.fetchAsset ?? fetch;
    this.launch = new DimSumStartupSurpriseLaunch(options.randomDraw ?? secureDraw);
    this.publicAsset = asset;
    this.now = options.now ?? (() => new Date());
  }

  async isFirstRun(): Promise<boolean> {
    try { await fs.access(this.firstRunMarker); return false; }
    catch { return true; }
  }

  async startup(input: Omit<DimSumStartupInput, 'dish' | 'publicAsset'>): Promise<DimSumStartupPresentation | null> {
    const cache = await this.readCache();
    const decision = this.launch.decide({
      ...input,
      dish: { names: cache?.provenance.names ?? this.publicAsset.names },
      publicAsset: cache?.provenance,
    });
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(this.firstRunMarker, '', { flag: 'a' });
    if (decision.status !== 'shown' || !cache) return null;
    return Object.freeze({ descriptor: decision.descriptor, imageDataUrl: `data:image/png;base64,${cache.image.toString('base64')}` });
  }

  async refresh(): Promise<boolean> {
    if (!validateDimSumPublicAsset(this.publicAsset)) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    timer.unref();
    try {
      let requestUrl = this.publicAsset.assetUrl;
      let response: Response | null = null;
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const candidate = await this.fetchAsset(requestUrl, {
          signal: controller.signal,
          redirect: 'manual',
          cache: 'no-store',
          credentials: 'omit',
        });
        if (candidate.status >= 300 && candidate.status < 400) {
          const next = safePublicRedirect(candidate.headers.get('location') ?? '', requestUrl);
          if (!next || redirects === MAX_REDIRECTS) return false;
          requestUrl = next;
          continue;
        }
        response = candidate;
        break;
      }
      if (!response?.ok) return false;
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength && contentLength !== this.publicAsset.assetSize) return false;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== this.publicAsset.assetSize || !validPng(bytes) || !exactDigest(bytes, this.publicAsset.sha256)) return false;
      const metadata = createDimSumSurpriseCacheMetadata(this.publicAsset, this.now().toISOString());
      if (!metadata) return false;
      const document: CacheDocument = { schemaVersion: CACHE_SCHEMA_VERSION, metadata, provenance: this.publicAsset };
      await fs.mkdir(this.directory, { recursive: true });
      const suffix = randomBytes(8).toString('hex');
      const imageTemp = `${this.imageFile}.${suffix}.tmp`;
      const manifestTemp = `${this.manifestFile}.${suffix}.tmp`;
      try {
        await fs.writeFile(imageTemp, bytes, { flag: 'wx' });
        await fs.writeFile(manifestTemp, `${JSON.stringify(document)}\n`, { encoding: 'utf8', flag: 'wx' });
        await fs.rename(imageTemp, this.imageFile);
        await fs.rename(manifestTemp, this.manifestFile);
      } finally {
        await Promise.all([fs.rm(imageTemp, { force: true }), fs.rm(manifestTemp, { force: true })]);
      }
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async readCache(): Promise<{ provenance: DimSumPublicAssetProvenance; image: Buffer } | null> {
    try {
      const [raw, image] = await Promise.all([fs.readFile(this.manifestFile, 'utf8'), fs.readFile(this.imageFile)]);
      if (Buffer.byteLength(raw, 'utf8') > 16 * 1024) return null;
      const parsed = JSON.parse(raw) as Partial<CacheDocument>;
      if (!parsed || parsed.schemaVersion !== CACHE_SCHEMA_VERSION || !parsed.metadata || !parsed.provenance) return null;
      if (!validateDimSumSurpriseCacheMetadata(parsed.metadata)) return null;
      const provenance = validateDimSumPublicAsset(parsed.provenance);
      if (!provenance || JSON.stringify(provenance) !== JSON.stringify(this.publicAsset)) return null;
      if (image.length !== provenance.assetSize || !validPng(image) || !exactDigest(image, provenance.sha256)) return null;
      return { provenance, image };
    } catch {
      return null;
    }
  }
}
