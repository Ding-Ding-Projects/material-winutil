/** Framework-neutral contracts for the local Ollama suite manager. */

export const OLLAMA_LOCAL_ORIGIN = 'http://127.0.0.1:11434' as const;
export const OLLAMA_OFFICIAL_CATALOG_ORIGIN = 'https://ollama.com' as const;
export const OLLAMA_LIMITS = Object.freeze({
  responseBytes: 8 * 1024 * 1024,
  catalogPages: 256,
  catalogVariants: 100_000,
  catalogCacheBytes: 32 * 1024 * 1024,
  catalogFreshMs: 24 * 60 * 60 * 1000,
  installedEnrichmentModels: 128,
  installedEnrichmentConcurrency: 2,
  installedEnrichmentCacheBytes: 2 * 1024 * 1024,
  installedEnrichmentFreshMs: 24 * 60 * 60 * 1000,
  installedEnrichmentResponseBytes: 512 * 1024,
  pullQueue: 128,
  pullConcurrency: 2,
  chatMessages: 64,
  chatMessageBytes: 32 * 1024,
  chatHistoryBytes: 512 * 1024,
  attachmentBytes: 8 * 1024 * 1024,
  modelNameLength: 240,
  systemPromptBytes: 32 * 1024,
} as const);

export const OLLAMA_DOCUMENTED_ROUTES = Object.freeze({
  version: Object.freeze({ method: 'GET', path: '/api/version' }),
  installed: Object.freeze({ method: 'GET', path: '/api/tags' }),
  show: Object.freeze({ method: 'POST', path: '/api/show' }),
  running: Object.freeze({ method: 'GET', path: '/api/ps' }),
  pull: Object.freeze({ method: 'POST', path: '/api/pull' }),
  chat: Object.freeze({ method: 'POST', path: '/api/chat' }),
} as const);

export type OllamaRouteName = keyof typeof OLLAMA_DOCUMENTED_ROUTES;
export type OllamaFitVerdict = 'runs-well' | 'runs-with-limits' | 'unlikely' | 'unknown';
export type OllamaCapability = 'text' | 'vision' | 'tools' | 'embedding';

export interface OllamaModelDetails {
  format: string;
  family: string;
  families: string[];
  parameterSize: string;
  quantization: string;
}

export interface OllamaInstalledModel {
  name: string;
  model: string;
  modifiedAt: string;
  sizeBytes: number;
  digest: string;
  details: OllamaModelDetails;
}

export interface OllamaRunningModel extends OllamaInstalledModel {
  expiresAt: string;
  sizeVramBytes: number;
  contextLength: number;
}

export interface OllamaHealthSnapshot {
  state: 'healthy' | 'missing' | 'unhealthy';
  checkedAt: string;
  version: string | null;
  installed: OllamaInstalledModel[];
  running: OllamaRunningModel[];
  message: string;
}

/** A deliberately small, local-only projection of a documented /api/show response. */
export interface OllamaInstalledEnrichment {
  name: string;
  digest: string;
  sizeBytes: number;
  family: string;
  parameterSize: string;
  quantization: string;
  capabilities: OllamaCapability[];
}

export interface OllamaInstalledEnrichmentSnapshot {
  schemaVersion: 1;
  source: 'local-ollama-installed-enrichment';
  sourceRevision: string;
  inventoryRevision: string;
  fetchedAt: string;
  version: string;
  complete: boolean;
  skippedCount: number;
  stale: boolean;
  models: OllamaInstalledEnrichment[];
  message: string;
}

export interface OllamaCatalogVariant {
  model: string;
  tag: string;
  qualifiedName: string;
  digest: string | null;
  blobSizeBytes: number | null;
  parameterCount: number | null;
  quantization: string | null;
  contextLength: number | null;
  capabilities: OllamaCapability[];
  publishedAt: string | null;
  sourceUrl: string;
}

export interface OllamaCatalogPage {
  schemaVersion: 1;
  source: 'official-ollama-catalog';
  sourceRevision: string;
  page: number;
  pageUrl: string;
  nextPageUrl: string | null;
  variants: OllamaCatalogVariant[];
}

export interface OllamaCatalogSnapshot {
  schemaVersion: 1;
  source: 'official-ollama-catalog';
  sourceRevision: string;
  refreshedAt: string;
  pageCount: number;
  complete: boolean;
  stale: boolean;
  variants: OllamaCatalogVariant[];
  installedOnly: OllamaInstalledModel[];
  message: string;
}

export interface OllamaHardwareProbeState {
  state: 'available' | 'unavailable' | 'error';
  message: string;
}

export interface OllamaHardwareEvidence {
  detectedAt: string;
  ramTotalBytes: number | null;
  ramAvailableBytes: number | null;
  gpuName: string | null;
  vramTotalBytes: number | null;
  vramAvailableBytes: number | null;
  gpuDriver: string | null;
  gpuSupported: boolean | null;
  diskFreeBytes: number | null;
  probes: {
    ram: OllamaHardwareProbeState;
    disk: OllamaHardwareProbeState;
    gpu: OllamaHardwareProbeState;
  };
}

export interface OllamaFitAssessment {
  verdict: OllamaFitVerdict;
  reasons: string[];
  evidence: OllamaHardwareEvidence;
  requirements: {
    blobSizeBytes: number | null;
    parameterCount: number | null;
    quantization: string | null;
    contextLength: number | null;
    estimatedWorkingSetBytes: number | null;
    requiredFreeDiskBytes: number | null;
  };
}

export interface OllamaPullRequest { model: string; }
export interface OllamaPullProgress {
  model: string;
  state: 'queued' | 'pulling' | 'completed' | 'cancelled' | 'failed';
  status: string;
  completedBytes: number | null;
  totalBytes: number | null;
  error: string | null;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface OllamaChatOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  numCtx?: number;
  numPredict?: number;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  options: OllamaChatOptions;
}

/**
 * Redacted, portable chat transcript. Image payloads and the system prompt are
 * intentionally omitted before this shape crosses the application boundary.
 */
export interface OllamaChatExportDocument {
  schemaVersion: 1;
  messages: Array<{
    role: OllamaChatMessage['role'];
    content: string;
    attachmentsOmitted: number;
  }>;
}

/**
 * User-selected local export format and chat content. The caller never chooses
 * a destination path; the privileged process owns the save dialog and write.
 */
export interface OllamaChatExportSaveRequest {
  chat: OllamaChatRequest;
  format: 'markdown' | 'json';
}

/** The result of a user-mediated local chat export. */
export type OllamaChatExportResult =
  | { status: 'saved'; filePath: string; document: OllamaChatExportDocument }
  | { status: 'cancelled'; document: OllamaChatExportDocument };

export type OllamaHarnessProfileId = 'vscode-continue' | 'opencode-local' | 'open-webui-local';
export interface OllamaHarnessProfile {
  id: OllamaHarnessProfileId;
  label: string;
  executableId: string;
  supportedCapabilities: OllamaCapability[];
  semanticFields: Array<'model' | 'contextLength' | 'workspaceFolder'>;
  allowlistedArguments: string[];
  allowlistedEnvironmentKeys: string[];
}

export interface OllamaHarnessConfiguration {
  model: string;
  contextLength?: number;
  workspaceFolder?: string;
}

export interface OllamaHarnessExecutable {
  profileId: OllamaHarnessProfileId;
  executableId: string;
  path: string;
  label: string;
}

export interface OllamaHarnessPlan {
  schemaVersion: 1;
  profileId: OllamaHarnessProfileId;
  model: string;
  executableId: string;
  executablePath: string;
  arguments: string[];
  environment: Record<string, string>;
  snapshot: { schemaVersion: 1; profileId: OllamaHarnessProfileId; createdAt: string; configuration: OllamaHarnessConfiguration };
  rollbackRequiredOnFailure: true;
}

export interface OllamaHarnessLaunchResult {
  schemaVersion: 1;
  plan: OllamaHarnessPlan;
  state: 'ready' | 'rolled-back';
  readiness: { ollamaHealthy: boolean; processStarted: boolean; checkedAt: string; message: string };
  restoredConfiguration: OllamaHarnessConfiguration | null;
}

export interface OllamaHarnessPreflightRequest {
  profileId: OllamaHarnessProfileId;
  model: string;
  configuration: OllamaHarnessConfiguration;
  executablePath: string;
}

export interface OllamaHarnessRestoreResult {
  schemaVersion: 1;
  restored: boolean;
  configuration: OllamaHarnessConfiguration | null;
  message: string;
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const CHAT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function onlyKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key) || ['__proto__', 'prototype', 'constructor'].includes(key))) {
    throw new Error(`${label} contains missing or unknown fields.`);
  }
}

function text(value: unknown, label: string, maximum = 512): string {
  if (typeof value !== 'string' || !value || value.length > maximum || CONTROL.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function integer(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) throw new Error(`${label} is invalid.`);
  return Number(value);
}

export function validateOllamaModelName(value: unknown): string {
  const model = text(value, 'The model name', OLLAMA_LIMITS.modelNameLength);
  if (!MODEL_NAME.test(model) || model.includes('..') || model.includes('//') || /^(?:https?|file):/iu.test(model)) throw new Error('The model name is invalid.');
  return model;
}

export function validateOllamaLocalUrl(value: string, route: OllamaRouteName): URL {
  const url = new URL(value);
  const expected = new URL(OLLAMA_DOCUMENTED_ROUTES[route].path, `${OLLAMA_LOCAL_ORIGIN}/`);
  if (url.href !== expected.href || url.username || url.password || url.search || url.hash) {
    throw new Error('Ollama requests are limited to the fixed loopback origin and documented route.');
  }
  return url;
}

export function validateOfficialCatalogUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== OLLAMA_OFFICIAL_CATALOG_ORIGIN || url.username || url.password || url.hash) {
    throw new Error('Catalog metadata must come from the credential-free official Ollama catalog.');
  }
  if (!/^\/library(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?\/?$/u.test(url.pathname)) throw new Error('The official catalog path is invalid.');
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== 'page') || (url.searchParams.has('page') && !/^[1-9]\d{0,3}$/u.test(url.searchParams.get('page') ?? ''))) {
    throw new Error('The official catalog pagination is invalid.');
  }
  return url;
}

function parseDetails(value: unknown): OllamaModelDetails {
  if (!record(value)) throw new Error('Model details are invalid.');
  const families = value.families;
  if (!Array.isArray(families) || families.length > 32) throw new Error('Model families are invalid.');
  return {
    format: text(value.format, 'Model format', 64),
    family: text(value.family, 'Model family', 120),
    families: families.map((item) => text(item, 'Model family', 120)),
    parameterSize: text(value.parameter_size, 'Model parameter size', 64),
    quantization: text(value.quantization_level, 'Model quantization', 64),
  };
}

function parseInstalled(value: unknown): OllamaInstalledModel {
  if (!record(value)) throw new Error('Installed model metadata is invalid.');
  const digest = text(value.digest, 'Model digest', 64);
  if (!SHA256.test(digest)) throw new Error('Model digest is invalid.');
  return {
    name: validateOllamaModelName(value.name), model: validateOllamaModelName(value.model),
    modifiedAt: text(value.modified_at, 'Model timestamp', 80), sizeBytes: integer(value.size, 'Model size'), digest,
    details: parseDetails(value.details),
  };
}

export function parseOllamaVersion(value: unknown): string {
  if (!record(value)) throw new Error('Ollama version metadata is invalid.');
  const version = text(value.version, 'Ollama version', 64);
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version)) throw new Error('Ollama version metadata is invalid.');
  return version;
}

export function parseOllamaInstalled(value: unknown): OllamaInstalledModel[] {
  if (!record(value) || !Array.isArray(value.models) || value.models.length > 10_000) throw new Error('Installed model inventory is invalid.');
  const result = value.models.map(parseInstalled);
  if (new Set(result.map(({ name }) => name)).size !== result.length) throw new Error('Installed model inventory contains duplicates.');
  return result;
}

export function parseOllamaInstalledEnrichment(value: unknown, installed: OllamaInstalledModel): OllamaInstalledEnrichment {
  if (!record(value)) throw new Error('Installed model enrichment is invalid.');
  const capabilities = value.capabilities === undefined ? [] : value.capabilities;
  if (!Array.isArray(capabilities) || capabilities.length > 16 || capabilities.some((item) => typeof item !== 'string')) {
    throw new Error('Installed model capabilities are invalid.');
  }
  const mapped = new Set<OllamaCapability>();
  for (const capability of capabilities) {
    if (capability === 'completion') mapped.add('text');
    else if (capability === 'vision') mapped.add('vision');
    else if (capability === 'tools') mapped.add('tools');
    else if (capability === 'embedding') mapped.add('embedding');
    else throw new Error('Installed model capabilities are invalid.');
  }
  return {
    name: installed.name, digest: installed.digest, sizeBytes: installed.sizeBytes,
    family: installed.details.family, parameterSize: installed.details.parameterSize,
    quantization: installed.details.quantization, capabilities: [...mapped].sort(),
  };
}

export function parseOllamaRunning(value: unknown): OllamaRunningModel[] {
  if (!record(value) || !Array.isArray(value.models) || value.models.length > 1_000) throw new Error('Running model inventory is invalid.');
  return value.models.map((item) => {
    if (!record(item)) throw new Error('Running model metadata is invalid.');
    const digest = text(item.digest, 'Model digest', 64);
    if (!SHA256.test(digest)) throw new Error('Model digest is invalid.');
    return {
      name: validateOllamaModelName(item.name), model: validateOllamaModelName(item.model), modifiedAt: '',
      sizeBytes: integer(item.size, 'Model size'), digest, details: parseDetails(item.details),
      expiresAt: text(item.expires_at, 'Running model expiry', 80), sizeVramBytes: integer(item.size_vram, 'VRAM size'),
      contextLength: integer(item.context_length, 'Context length', 16_777_216),
    };
  });
}

export function validateCatalogVariant(value: unknown): OllamaCatalogVariant {
  if (!record(value)) throw new Error('Catalog variant is invalid.');
  onlyKeys(value, ['model', 'tag', 'qualifiedName', 'digest', 'blobSizeBytes', 'parameterCount', 'quantization', 'contextLength', 'capabilities', 'publishedAt', 'sourceUrl'], 'Catalog variant');
  const model = validateOllamaModelName(value.model);
  const tag = text(value.tag, 'Catalog tag', 120);
  const qualifiedName = validateOllamaModelName(value.qualifiedName);
  if (qualifiedName !== `${model}:${tag}`) throw new Error('Catalog variant identity is inconsistent.');
  const sourceUrl = validateOfficialCatalogUrl(text(value.sourceUrl, 'Catalog source URL', 1_024)).href;
  const digest = value.digest === null ? null : text(value.digest, 'Catalog digest', 64);
  if (digest !== null && !SHA256.test(digest)) throw new Error('Catalog digest is invalid.');
  const capabilities = value.capabilities;
  const allowed = new Set<OllamaCapability>(['text', 'vision', 'tools', 'embedding']);
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.length > 4 || capabilities.some((item) => !allowed.has(item as OllamaCapability))) throw new Error('Catalog capabilities are invalid.');
  const nullableInteger = (item: unknown, label: string) => item === null ? null : integer(item, label);
  return {
    model, tag, qualifiedName,
    digest,
    blobSizeBytes: nullableInteger(value.blobSizeBytes, 'Catalog blob size'),
    parameterCount: nullableInteger(value.parameterCount, 'Catalog parameter count'),
    quantization: value.quantization === null ? null : text(value.quantization, 'Catalog quantization', 64),
    contextLength: nullableInteger(value.contextLength, 'Catalog context length'),
    capabilities: [...new Set(capabilities as OllamaCapability[])],
    publishedAt: value.publishedAt === null ? null : text(value.publishedAt, 'Catalog publication timestamp', 80), sourceUrl,
  };
}

export function validateCatalogPage(value: unknown): OllamaCatalogPage {
  if (!record(value) || value.schemaVersion !== 1 || value.source !== 'official-ollama-catalog') throw new Error('Catalog page schema is invalid.');
  onlyKeys(value, ['schemaVersion', 'source', 'sourceRevision', 'page', 'pageUrl', 'nextPageUrl', 'variants'], 'Catalog page');
  const variants = value.variants;
  if (!Array.isArray(variants) || variants.length > 10_000) throw new Error('Catalog page variant count is invalid.');
  const page = integer(value.page, 'Catalog page number', OLLAMA_LIMITS.catalogPages);
  if (page < 1) throw new Error('Catalog page number is invalid.');
  return {
    schemaVersion: 1, source: 'official-ollama-catalog', sourceRevision: text(value.sourceRevision, 'Catalog source revision', 128),
    page, pageUrl: validateOfficialCatalogUrl(text(value.pageUrl, 'Catalog page URL', 1_024)).href,
    nextPageUrl: value.nextPageUrl === null ? null : validateOfficialCatalogUrl(text(value.nextPageUrl, 'Next catalog page URL', 1_024)).href,
    variants: variants.map(validateCatalogVariant),
  };
}

function safeBytes(value: number | null): number | null { return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null; }

export function assessOllamaFit(variant: OllamaCatalogVariant, evidence: OllamaHardwareEvidence): OllamaFitAssessment {
  const blob = safeBytes(variant.blobSizeBytes);
  const parameters = safeBytes(variant.parameterCount);
  const context = safeBytes(variant.contextLength);
  const estimatedWeights = blob ?? (parameters === null ? null : Math.ceil(parameters * 0.75));
  const contextOverhead = context === null ? null : Math.max(512 * 1024 * 1024, context * 256 * 1024);
  const working = estimatedWeights === null || contextOverhead === null ? null : estimatedWeights + contextOverhead;
  const disk = blob === null ? null : Math.ceil(blob * 1.2);
  const reasons: string[] = [];
  let verdict: OllamaFitVerdict = 'unknown';
  if (blob === null || parameters === null || context === null || !variant.quantization) reasons.push('The official variant lacks exact size, parameter, quantization, or context evidence.');
  if (evidence.diskFreeBytes === null || evidence.ramAvailableBytes === null || working === null || disk === null) reasons.push('Hardware or model resource evidence is incomplete.');
  if (working !== null && disk !== null && evidence.ramAvailableBytes !== null && evidence.diskFreeBytes !== null) {
    if (evidence.diskFreeBytes < disk || evidence.ramAvailableBytes < Math.ceil(working * 0.75)) {
      verdict = 'unlikely'; reasons.push('Free disk or available memory is below the conservative requirement.');
    } else if (evidence.ramAvailableBytes >= Math.ceil(working * 1.25)
      && evidence.gpuSupported === true && evidence.vramAvailableBytes !== null && evidence.vramAvailableBytes >= working) {
      verdict = 'runs-well'; reasons.push('Available memory and disk exceed the conservative working-set allowance.');
    } else {
      verdict = 'runs-with-limits'; reasons.push('The model fits conservatively, but memory, VRAM, or accelerator evidence leaves limited headroom.');
    }
  }
  if (evidence.gpuSupported === false) reasons.push('The detected GPU or driver is not reported as supported; CPU fallback may apply.');
  return { verdict, reasons, evidence: { ...evidence }, requirements: { blobSizeBytes: blob, parameterCount: parameters, quantization: variant.quantization, contextLength: context, estimatedWorkingSetBytes: working, requiredFreeDiskBytes: disk } };
}

export function validateChatRequest(value: OllamaChatRequest, variant: OllamaCatalogVariant): OllamaChatRequest {
  if (!record(value)) throw new Error('Chat request is invalid.');
  onlyKeys(value, ['model', 'messages', 'options'], 'Chat request');
  const model = validateOllamaModelName(value.model);
  if (model !== variant.qualifiedName) throw new Error('Chat model is not the selected official variant.');
  if (!Array.isArray(value.messages) || !value.messages.length || value.messages.length > OLLAMA_LIMITS.chatMessages) throw new Error('Chat history count is invalid.');
  let total = 0;
  const messages = value.messages.map((message) => {
    if (!record(message) || !['system', 'user', 'assistant'].includes(String(message.role))) throw new Error('Chat message role is invalid.');
    onlyKeys(message, message.images === undefined ? ['role', 'content'] : ['role', 'content', 'images'], 'Chat message');
    const content = typeof message.content === 'string' ? message.content : '';
    const bytes = Buffer.byteLength(content, 'utf8'); total += bytes;
    if (!content || bytes > OLLAMA_LIMITS.chatMessageBytes || CHAT_CONTROL.test(content)) throw new Error('Chat message content is invalid.');
    const images = message.images ?? [];
    if (!Array.isArray(images) || images.length > 4 || images.some((image) => typeof image !== 'string' || !image || !BASE64.test(image) || Buffer.byteLength(image, 'base64') > OLLAMA_LIMITS.attachmentBytes)) throw new Error('Chat attachments are invalid.');
    if (images.length && !variant.capabilities.includes('vision')) throw new Error('The selected variant does not support image attachments.');
    return { role: message.role, content, ...(images.length ? { images: [...images] } : {}) };
  });
  if (total > OLLAMA_LIMITS.chatHistoryBytes) throw new Error('Chat history exceeds its byte limit.');
  const options = value.options ?? {};
  if (!record(options)) throw new Error('Chat options are invalid.');
  const optionKeys = ['temperature', 'topP', 'topK', 'seed', 'numCtx', 'numPredict'];
  if (Object.keys(options).some((key) => !optionKeys.includes(key))) throw new Error('Chat options contain unknown fields.');
  const bounded = (number: unknown, minimum: number, maximum: number, label: string) => {
    if (number === undefined) return undefined;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label} is outside its supported range.`);
    return number;
  };
  const validated: OllamaChatOptions = {};
  validated.temperature = bounded(options.temperature, 0, 2, 'Temperature');
  validated.topP = bounded(options.topP, 0, 1, 'Top P');
  validated.topK = bounded(options.topK, 0, 1_000, 'Top K');
  validated.seed = bounded(options.seed, -1, 2_147_483_647, 'Seed');
  validated.numCtx = bounded(options.numCtx, 256, Math.min(variant.contextLength ?? 131_072, 1_048_576), 'Context length');
  validated.numPredict = bounded(options.numPredict, -1, 1_048_576, 'Prediction length');
  return { model, messages, options: Object.fromEntries(Object.entries(validated).filter(([, item]) => item !== undefined)) };
}

export function redactChatExport(messages: OllamaChatMessage[]): OllamaChatExportDocument {
  const secret = /(?:bearer\s+|api[_-]?key\s*[:=]\s*|token\s*[:=]\s*|password\s*[:=]\s*)[^\s,;]+/giu;
  return { schemaVersion: 1, messages: messages.map((message) => ({
    role: message.role,
    content: message.role === 'system' ? '[system prompt omitted]' : message.content.replace(secret, '[redacted]'),
    attachmentsOmitted: message.images?.length ?? 0,
  })) };
}

export const OLLAMA_HARNESS_PROFILES: ReadonlyArray<OllamaHarnessProfile> = Object.freeze([
  Object.freeze<OllamaHarnessProfile>({ id: 'vscode-continue', label: 'Continue in Visual Studio Code', executableId: 'vscode', supportedCapabilities: ['text', 'vision', 'tools'], semanticFields: ['model', 'contextLength', 'workspaceFolder'], allowlistedArguments: ['--reuse-window'], allowlistedEnvironmentKeys: ['OLLAMA_HOST'] }),
  Object.freeze<OllamaHarnessProfile>({ id: 'opencode-local', label: 'OpenCode local profile', executableId: 'opencode', supportedCapabilities: ['text', 'vision', 'tools'], semanticFields: ['model', 'contextLength', 'workspaceFolder'], allowlistedArguments: [], allowlistedEnvironmentKeys: ['OLLAMA_HOST'] }),
  Object.freeze<OllamaHarnessProfile>({ id: 'open-webui-local', label: 'Open WebUI local profile', executableId: 'open-webui', supportedCapabilities: ['text', 'vision'], semanticFields: ['model', 'contextLength'], allowlistedArguments: [], allowlistedEnvironmentKeys: ['OLLAMA_BASE_URL'] }),
]);

export function createHarnessPlan(profileId: OllamaHarnessProfileId, variant: OllamaCatalogVariant, configuration: OllamaHarnessConfiguration, executable: OllamaHarnessExecutable, now = new Date()): OllamaHarnessPlan {
  const profile = OLLAMA_HARNESS_PROFILES.find(({ id }) => id === profileId);
  if (!profile) throw new Error('Harness profile is not allowlisted.');
  if (!record(configuration) || Object.keys(configuration).some((key) => !profile.semanticFields.includes(key as never))) throw new Error('Harness configuration contains an unsupported field.');
  if (configuration.model !== variant.qualifiedName) throw new Error('Harness model must be selected from the verified catalog.');
  if (configuration.contextLength !== undefined && (!Number.isSafeInteger(configuration.contextLength) || configuration.contextLength < 256 || configuration.contextLength > (variant.contextLength ?? 1_048_576))) {
    throw new Error('Harness context length is invalid.');
  }
  if (configuration.workspaceFolder !== undefined && (!configuration.workspaceFolder || configuration.workspaceFolder.length > 4_096 || CONTROL.test(configuration.workspaceFolder))) {
    throw new Error('Harness workspace folder is invalid.');
  }
  if (!record(executable) || executable.profileId !== profileId || executable.executableId !== profile.executableId
    || !text(executable.path, 'Harness executable path', 4_096) || !text(executable.label, 'Harness executable label', 256)) {
    throw new Error('Harness executable is not an allowlisted installed executable.');
  }
  return { schemaVersion: 1, profileId, model: variant.qualifiedName, executableId: profile.executableId, executablePath: executable.path,
    arguments: [...profile.allowlistedArguments], environment: profile.id === 'open-webui-local' ? { OLLAMA_BASE_URL: OLLAMA_LOCAL_ORIGIN } : { OLLAMA_HOST: OLLAMA_LOCAL_ORIGIN },
    snapshot: { schemaVersion: 1, profileId, createdAt: now.toISOString(), configuration: structuredClone(configuration) }, rollbackRequiredOnFailure: true };
}

export function restoreHarnessSnapshot(plan: OllamaHarnessPlan): OllamaHarnessConfiguration {
  if (!record(plan) || plan.schemaVersion !== 1 || plan.rollbackRequiredOnFailure !== true || !record(plan.snapshot)
    || plan.snapshot.schemaVersion !== 1 || plan.snapshot.profileId !== plan.profileId || !record(plan.snapshot.configuration)) {
    throw new Error('The harness rollback snapshot is invalid.');
  }
  const profile = OLLAMA_HARNESS_PROFILES.find(({ id }) => id === plan.profileId);
  if (!profile || plan.executableId !== profile.executableId || !text(plan.executablePath, 'Harness executable path', 4_096)
    || Object.keys(plan.snapshot.configuration).some((key) => !profile.semanticFields.includes(key as never))) {
    throw new Error('The harness rollback snapshot is not allowlisted.');
  }
  return structuredClone(plan.snapshot.configuration);
}
