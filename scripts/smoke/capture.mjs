import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { assertBuiltArtifactFresh, assertGitClean, extractSquirrelApplication, findCurrentSquirrelPackage, gitCommit, parseArgs, selectCaptureManifests, sha256File } from './lib/contracts.mjs';
import { CdpClient, assertSingleTarget, waitForTargets } from './lib/cdp.mjs';
import { commandLine, lowlevel } from './lib/lowlevel.mjs';
import { assertUniquePngs, inspectPng } from './lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const options = parseArgs(process.argv.slice(2));
const captureRoot = options.captureRoot || join(repo, 'docs', 'screenshots', 'smoke');

async function loadManifest(name) {
  const path = join(here, `${name}-manifest.json`);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.captures)) throw new Error(`${path} has an unsupported schema`);
  const ids = new Set();
  const files = new Set();
  for (const capture of manifest.captures) {
    if (!capture.id || !capture.file || ids.has(capture.id) || files.has(capture.file)) throw new Error(`${path} has duplicate or incomplete capture entries`);
    ids.add(capture.id);
    files.add(capture.file);
  }
  return manifest;
}

async function filesBelow(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(full));
    else if (entry.isFile()) output.push(full);
  }
  return output;
}

async function resolveAppArtifact(commit) {
  const squirrel = await findCurrentSquirrelPackage(repo, commit);
  if (squirrel) {
    const extractedRoot = await mkdtemp(join(tmpdir(), 'material-winutil-squirrel-'));
    await extractSquirrelApplication(repo, squirrel, extractedRoot);
    const packageJson = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
    const expectedName = `${packageJson.productName}.exe`.toLowerCase();
    const executables = (await filesBelow(extractedRoot)).filter((file) => file.toLowerCase().endsWith(`\\${expectedName}`));
    if (executables.length !== 1) {
      await rm(extractedRoot, { recursive: true, force: true });
      throw new Error(`validated Squirrel package did not contain exactly one ${packageJson.productName}.exe payload`);
    }
    return {
      executable: executables[0],
      args: (profile, port) => [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-allow-origins=*', '--no-first-run'],
      cleanupRoot: extractedRoot,
      metadata: {
        kind: 'validated-squirrel-full-package',
        developmentFallback: false,
        sourceCommit: squirrel.provenance.commit,
        packagePath: squirrel.packagePath,
        packageSha256: squirrel.packageSha256,
        provenancePath: squirrel.provenancePath,
        signatureStatus: squirrel.provenance.signatureStatus,
        setup: squirrel.provenance.setup,
        releases: squirrel.provenance.releases,
        fullPackage: squirrel.provenance.fullPackage,
        packageCount: squirrel.provenance.packageCount,
      },
    };
  }
  const executable = join(repo, 'node_modules', 'electron', 'dist', 'electron.exe');
  return {
    executable,
    args: (profile, port) => [repo, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-allow-origins=*', '--no-first-run'],
    cleanupRoot: '',
    metadata: {
      kind: 'development-electron-fallback',
      developmentFallback: true,
      sourceCommit: commit,
      fallbackReason: 'No current validated Squirrel full package and matching provenance manifest were present.',
    },
  };
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function literal(value) {
  return JSON.stringify(value);
}

async function waitForApp(client) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate("document.readyState==='complete' && Boolean(document.querySelector('#app .appbar')) && state.catalog.apps.length>0");
    if (ready) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error('desktop application did not reach the catalogue-ready state');
}

async function waitForSite(client) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate("document.readyState==='complete' && ['language','theme','density','dock','documentation-tab-list'].every((id)=>Boolean(document.getElementById(id)))");
    if (ready) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error('documentation site did not reach the preference-ready state');
}

async function prepareApp(client, capture, defaults) {
  const viewport = capture.viewport ?? defaults;
  await client.setViewport(viewport.width, viewport.height, viewport.scale ?? 1);
  await client.evaluate("document.querySelectorAll('.menu').forEach((node)=>node.remove())");
  const update = capture.update ? `state.update={...state.update,...${literal(capture.update)}};` : '';
  const expression = `(()=>{
    state.dialog=null;state.reading=null;state.snack='';state.search.text='';state.selected.clear();
    state.prefs={...state.prefs,theme:${literal(capture.theme ?? 'dark')},density:${literal(capture.density ?? 'comfortable')},language:${literal(capture.language ?? 'English')},reducedMotion:${Boolean(capture.reducedMotion)}};
    ${update}
    go(${literal(capture.view ?? 'install')});
    state.search.text=${literal(capture.search ?? '')};
    ${capture.dialog ? `openDialog(${literal(capture.dialog)});` : ''}
    ${capture.prepare ?? ''};
    render();
    return {view:state.view,dialog:state.dialog,theme:state.prefs.theme,language:state.prefs.language,density:state.prefs.density};
  })()`;
  const result = await client.evaluate(expression);
  const audit = await client.evaluate(`(()=>{
    const expectedWidth=${viewport.width};
    const root=document.documentElement;
    const active=document.querySelector('.pane,.reader');
    const dialog=document.querySelector('.dialog');
    const overflow=Math.max(root.scrollWidth,document.body.scrollWidth)-root.clientWidth;
    const offenders=[...document.querySelectorAll('body *')].map((node)=>{const rect=node.getBoundingClientRect();return {tag:node.tagName,className:String(node.className||'').slice(0,100),id:node.id,right:Math.round(rect.right),left:Math.round(rect.left),width:Math.round(rect.width),scrollWidth:node.scrollWidth}}).filter((item)=>item.right>root.clientWidth+2||item.left < -2).sort((a,b)=>b.right-a.right).slice(0,12);
    return {ready:document.readyState,heading:Boolean(document.querySelector('.appbar')),active:Boolean(active),dialog:${capture.dialog ? 'Boolean(dialog)' : 'true'},overflow,clientWidth:root.clientWidth,expectedWidth,offenders};
  })()`);
  if (!audit.heading || !audit.active || !audit.dialog || audit.overflow > 2) throw new Error(`${capture.id} failed DOM audit: ${JSON.stringify(audit)}`);
  return { ...result, audit, viewport };
}

async function prepareSite(client, capture, defaults) {
  const viewport = capture.viewport ?? defaults;
  await client.setViewport(viewport.width, viewport.height, viewport.scale ?? 1);
  const requestedPage = capture.page ?? 'home';
  const applied = await client.evaluate(`(()=>{
    ['capability-regex','settings-regex','command-palette','scrim','snackbar'].forEach((id)=>{const node=document.getElementById(id);if(node)node.hidden=true});
    ['capability-regex-button','settings-regex-button'].forEach((id)=>document.getElementById(id)?.setAttribute('aria-expanded','false'));
    ['capability-filter','capability-pattern','settings-search','settings-pattern','palette-search'].forEach((id)=>{const input=document.getElementById(id);if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))}});
    document.getElementById('tab-rail')?.classList.remove('open');document.body.style.overflow='';
    const set=(id,value)=>{const control=document.getElementById(id);if(!control)return false;control.value=value;control.dispatchEvent(new Event('change',{bubbles:true}));return true};
    const ok=set('language',${literal(capture.language ?? 'en')})&&set('theme',${literal(capture.theme ?? 'dark')})&&set('density','comfortable')&&set('dock',${literal(capture.dock ?? 'left')});
    document.querySelector('[data-page=${literal(requestedPage)}]')?.click();
    return ok;
  })()`);
  if (!applied) throw new Error(`${capture.id} could not apply the live site controls`);
  const activated = await client.evaluate(`document.querySelector('[data-panel=${literal(requestedPage)}]:not([hidden])')!==null`);
  if (!activated) throw new Error(`${capture.id} could not activate its requested page`);
  if (capture.prepare) await client.evaluate(`(()=>{${capture.prepare};return true})()`);
  const audit = await client.evaluate(`(()=>{const root=document.documentElement;return {page:${literal(capture.page ?? 'home')},panel:Boolean(document.querySelector('[data-panel=${literal(capture.page ?? 'home')}]:not([hidden])')),overflow:Math.max(root.scrollWidth,document.body.scrollWidth)-root.clientWidth,clientWidth:root.clientWidth}})()`);
  if (!audit.panel || audit.overflow > 2) throw new Error(`${capture.id} failed DOM audit: ${JSON.stringify(audit)}`);
  return { page: capture.page ?? 'home', theme: capture.theme ?? 'dark', language: capture.language ?? 'en', audit, viewport };
}

async function captureSession(kind, manifest, executable, argsForLaunch, expectedTarget, prepare, executableHash, commit, artifact) {
  const desktop = `material-winutil-smoke-${kind}-${process.pid}-${Date.now()}`;
  const profile = await mkdtemp(join(tmpdir(), `material-winutil-${kind}-`));
  const port = await freePort();
  const outputs = [];
  let pid = 0;
  let client;
  try {
    await lowlevel('create_headless_desktop', { name: desktop });
    const args = argsForLaunch(profile, port);
    const launched = await lowlevel('launch_on_headless_desktop', { name: desktop, command: commandLine(executable, args) });
    pid = launched.pid;
    const targets = await waitForTargets(port, 20000, async () => {
      const listed = await lowlevel('list_processes');
      return listed.processes?.some((process) => process.pid === pid) ?? false;
    });
    const target = assertSingleTarget(targets, expectedTarget, kind);
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.call('Page.enable');
    await client.call('Runtime.enable');
    if (kind === 'app') await waitForApp(client);
    else await waitForSite(client);
    let sessionArtifact = artifact;
    if (kind === 'site') {
      const deployedCommit = await client.evaluate(`document.querySelector('meta[name="material-winutil-source-commit"]')?.content||''`);
      if (deployedCommit !== commit) throw new Error(`live documentation deployment ${deployedCommit || '(missing)'} does not match current commit ${commit}`);
      sessionArtifact = { ...artifact, deployedCommit };
    }
    for (const capture of manifest.captures) {
      const state = await prepare(client, capture, manifest.defaultViewport);
      const output = join(captureRoot, kind, capture.file);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, await client.capturePng());
      const png = await inspectPng(output);
      outputs.push({
        id: capture.id,
        file: `docs/screenshots/smoke/${kind}/${capture.file}`,
        relativeFile: `smoke/${kind}/${capture.file}`,
        surface: manifest.surface,
        commit,
        executable: basename(executable),
        executableSha256: executableHash,
        artifact: sessionArtifact,
        captureMethod: 'cheap Lowlevel MCP hidden desktop + isolated loopback CDP Page.captureScreenshot',
        state,
        png,
      });
      process.stdout.write(`captured ${kind}:${capture.id} ${png.width}x${png.height} ${png.sha256}\n`);
    }
  } finally {
    client?.close();
    if (pid) { try { await lowlevel('kill_process', { pid, force: true }); } catch { /* close the desktop below */ } }
    try { await lowlevel('close_headless_desktop', { name: desktop }); } catch { /* preserve primary error */ }
    await rm(profile, { recursive: true, force: true });
  }
  return outputs;
}

async function verifyOnly(manifests, commit) {
  const results = [];
  for (const [kind, manifest] of manifests) {
    for (const capture of manifest.captures) {
      const file = join(captureRoot, kind, capture.file);
      let png;
      try { png = await inspectPng(file); }
      catch (error) {
        if (options.allowPartial && error?.code === 'ENOENT') continue;
        throw error;
      }
      results.push({ id: capture.id, file, png, surface: manifest.surface, commit });
    }
  }
  if (!results.length) throw new Error('verify-only found no capture files');
  assertUniquePngs(results);
  process.stdout.write(`verified ${results.length} non-uniform, uniquely hashed PNG capture(s)\n`);
}

async function main() {
  const commit = await gitCommit(repo);
  let manifests = [];
  if (options.mode === 'app' || options.mode === 'all') manifests.push(['app', await loadManifest('app')]);
  if (options.mode === 'site' || options.mode === 'all') manifests.push(['site', await loadManifest('site')]);
  manifests = selectCaptureManifests(manifests, options.ids);
  if (options.verifyOnly) return verifyOnly(manifests, commit);

  const cleanTree = await assertGitClean(repo);
  const freshness = await assertBuiltArtifactFresh(repo);
  const all = [];
  for (const [kind, manifest] of manifests) {
    if (kind === 'app') {
      const artifact = await resolveAppArtifact(commit);
      try {
        const hash = await sha256File(artifact.executable);
        const publicArtifact = {
          ...artifact.metadata,
          packagePath: artifact.metadata.packagePath ? basename(artifact.metadata.packagePath) : undefined,
          provenancePath: artifact.metadata.provenancePath ? relative(repo, artifact.metadata.provenancePath) : undefined,
        };
        for (const capture of manifest.captures) {
          all.push(...await captureSession(
            kind, { ...manifest, captures: [capture] }, artifact.executable, artifact.args,
            (target) => target.url.startsWith('file:') && /renderer\/index\.html$/u.test(new URL(target.url).pathname),
            prepareApp, hash, commit, publicArtifact,
          ));
        }
      } finally {
        if (artifact.cleanupRoot) await rm(artifact.cleanupRoot, { recursive: true, force: true });
      }
    } else {
      const executable = process.env.EDGE_EXE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
      const hash = await sha256File(executable);
      const expected = new URL(options.siteUrl).href;
      for (const capture of manifest.captures) {
        all.push(...await captureSession(
          kind,
          { ...manifest, captures: [capture] },
          executable,
          (profile, port) => [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-allow-origins=*', '--guest', '--disable-sync', '--disable-extensions', '--disable-component-extensions-with-background-pages', '--no-first-run', '--no-default-browser-check', '--disable-features=msEdgeFirstRunExperience,msEdgeSignin,msEdgeSync', `--app=${expected}`],
          (target) => new URL(target.url).href === expected,
          prepareSite,
          hash,
          commit,
          { kind: 'installed-edge', developmentFallback: false, sourceCommit: commit },
        ));
      }
    }
  }
  assertUniquePngs(all);
  const finalCommit = await gitCommit(repo);
  if (finalCommit !== commit) {
    throw new Error(`repository commit changed during capture (${commit} -> ${finalCommit}); discard this mixed-provenance run and retry`);
  }
  const metadata = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit,
    captureRoot: captureRoot.startsWith(repo) ? relative(repo, captureRoot) : '[external capture root]',
    cleanTree,
    freshness,
    safety: {
      systemChangingActions: 0,
      completedConfirmations: 0,
      packageCommands: 0,
      visibleDesktopInteractions: 0,
    },
    captures: all,
  };
  await mkdir(captureRoot, { recursive: true });
  await writeFile(join(captureRoot, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
  process.stdout.write(`wrote ${all.length} capture(s) and metadata for ${commit}\n`);
}

main().catch((error) => {
  process.stderr.write(`smoke capture failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
