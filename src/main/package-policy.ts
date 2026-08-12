import type { RunKind, WinutilApp, WinutilCatalog } from '../shared/types';

export interface ResolvedPackage {
  catalogId: string;
  packageId: string;
  source: 'winget' | 'msstore';
}

export interface PackagePolicyResult {
  ok: boolean;
  code: number;
  error: string;
  packages: ResolvedPackage[];
}

const CATALOG_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/;
const PACKAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/;
const STORE_ID = /^[A-Za-z0-9]{1,32}$/;
const MAX_PACKAGE_BATCH = 100;

function parseOwnedPackage(app: WinutilApp): ResolvedPackage | null {
  if (!CATALOG_ID.test(app.id) || typeof app.winget !== 'string') return null;
  if (app.winget.startsWith('msstore:')) {
    const packageId = app.winget.slice('msstore:'.length);
    return STORE_ID.test(packageId) ? { catalogId: app.id, packageId, source: 'msstore' } : null;
  }
  return PACKAGE_ID.test(app.winget)
    ? { catalogId: app.id, packageId: app.winget, source: 'winget' }
    : null;
}

export function resolvePackageRequest(
  catalog: WinutilCatalog,
  kind: RunKind,
  catalogIds: unknown,
): PackagePolicyResult {
  if (!['install', 'upgrade', 'uninstall'].includes(kind)) {
    return { ok: false, code: 78, error: `${kind} is unavailable in this build.`, packages: [] };
  }
  if (!Array.isArray(catalogIds) || catalogIds.some((id) => typeof id !== 'string' || !CATALOG_ID.test(id))) {
    return { ok: false, code: 64, error: 'Package selection must be an array of catalogue identifiers.', packages: [] };
  }
  if (kind === 'upgrade') {
    return catalogIds.length
      ? { ok: false, code: 64, error: 'Upgrade all does not accept package identifiers.', packages: [] }
      : { ok: true, code: 0, error: '', packages: [] };
  }
  if (!catalogIds.length || catalogIds.length > MAX_PACKAGE_BATCH || new Set(catalogIds).size !== catalogIds.length) {
    return { ok: false, code: 64, error: `Select between 1 and ${MAX_PACKAGE_BATCH} distinct catalogue items.`, packages: [] };
  }

  const owned = new Map<string, ResolvedPackage>();
  for (const app of catalog.apps) {
    const parsed = parseOwnedPackage(app);
    if (parsed) owned.set(parsed.catalogId, parsed);
  }
  const packages = catalogIds.map((id) => owned.get(id) ?? null);
  if (packages.some((item) => item === null)) {
    return { ok: false, code: 64, error: 'A selected catalogue item has no approved WinGet package.', packages: [] };
  }
  return { ok: true, code: 0, error: '', packages: packages as ResolvedPackage[] };
}

export function wingetArgs(kind: 'install' | 'uninstall', item: ResolvedPackage): string[] {
  const args = [
    kind, '--id', item.packageId, '--source', item.source, '--exact', '--silent', '--disable-interactivity',
    '--accept-source-agreements',
  ];
  if (kind === 'install') args.push('--accept-package-agreements');
  return args;
}

export function validateCatalog(value: unknown): WinutilCatalog {
  if (!value || typeof value !== 'object') throw new Error('The bundled catalogue root is invalid.');
  const catalog = value as Partial<WinutilCatalog>;
  if (!Array.isArray(catalog.apps) || !Array.isArray(catalog.tweaks) || !Array.isArray(catalog.features)
    || !catalog.presets || typeof catalog.presets !== 'object' || !catalog.dns || typeof catalog.dns !== 'object') {
    throw new Error('The bundled catalogue is missing required collections.');
  }
  if (catalog.apps.length !== 227 || catalog.tweaks.length !== 67 || catalog.features.length !== 33) {
    throw new Error('The bundled catalogue does not match the reviewed inventory.');
  }
  const seen = new Set<string>();
  for (const app of catalog.apps) {
    if (!app || typeof app !== 'object' || !CATALOG_ID.test(app.id) || seen.has(app.id)
      || typeof app.name !== 'string' || typeof app.desc !== 'string' || typeof app.cat !== 'string'
      || typeof app.winget !== 'string' || typeof app.choco !== 'string' || typeof app.link !== 'string'
      || typeof app.foss !== 'boolean') {
      throw new Error(`The bundled catalogue contains an invalid application record: ${String(app?.id ?? 'unknown')}.`);
    }
    seen.add(app.id);
    if (app.winget && !parseOwnedPackage(app)) throw new Error(`Invalid WinGet identifier for catalogue item ${app.id}.`);
  }
  return catalog as WinutilCatalog;
}
