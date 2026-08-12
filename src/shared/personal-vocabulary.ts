/**
 * Local-only personal vocabulary contract.
 *
 * This module deliberately performs no I/O. Callers own file selection, private
 * cache storage, and the decision about which technical text must be preserved.
 */

export const PERSONAL_VOCABULARY_LIMITS = Object.freeze({
  schemaVersion: 1 as const,
  maxPayloadBytes: 64 * 1024,
  maxDepth: 8,
  maxEntries: 512,
  maxKeyLength: 128,
  maxValueLength: 512,
});

export type PersonalVocabularyErrorCode =
  | 'payload-too-large'
  | 'invalid-encoding'
  | 'invalid-json'
  | 'depth-limit'
  | 'duplicate-key'
  | 'unsafe-key'
  | 'invalid-schema'
  | 'too-many-entries'
  | 'invalid-key'
  | 'invalid-value';

export interface PersonalVocabularyDocument {
  readonly version: 1;
  readonly mappings: Readonly<Record<string, string>>;
}

export interface PersonalVocabularyValidationSuccess {
  readonly ok: true;
  readonly document: PersonalVocabularyDocument;
  readonly canonicalCache: string;
}

export interface PersonalVocabularyValidationFailure {
  readonly ok: false;
  readonly code: PersonalVocabularyErrorCode;
  readonly message: 'Personal vocabulary data is invalid.';
}

export type PersonalVocabularyValidationResult =
  | PersonalVocabularyValidationSuccess
  | PersonalVocabularyValidationFailure;

export interface PersonalVocabularyReplacementOptions {
  /** Return true to keep this occurrence unchanged (for example, a code span). */
  readonly preserveMatch?: (match: string, start: number, end: number, input: string) => boolean;
}

const NEUTRAL_ERROR_MESSAGE = 'Personal vocabulary data is invalid.' as const;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

class ContractError extends Error {
  constructor(readonly code: PersonalVocabularyErrorCode) {
    super(NEUTRAL_ERROR_MESSAGE);
    this.name = 'PersonalVocabularyValidationError';
  }
}

class BoundedJsonParser {
  private offset = 0;

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.skipWhitespace();
    const value = this.parseValue(1);
    this.skipWhitespace();
    if (this.offset !== this.source.length) this.fail('invalid-json');
    return value;
  }

  private parseValue(depth: number): unknown {
    if (depth > PERSONAL_VOCABULARY_LIMITS.maxDepth) this.fail('depth-limit');
    const token = this.source[this.offset];
    if (token === '{') return this.parseObject(depth);
    if (token === '[') return this.parseArray(depth);
    if (token === '"') return this.parseString();
    if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) return this.parseNumber();
    if (this.source.startsWith('true', this.offset)) return this.consumeLiteral('true', true);
    if (this.source.startsWith('false', this.offset)) return this.consumeLiteral('false', false);
    if (this.source.startsWith('null', this.offset)) return this.consumeLiteral('null', null);
    return this.fail('invalid-json');
  }

  private parseObject(depth: number): Record<string, unknown> {
    this.offset += 1;
    const object: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.source[this.offset] === '}') {
      this.offset += 1;
      return object;
    }

    while (this.offset < this.source.length) {
      if (this.source[this.offset] !== '"') this.fail('invalid-json');
      const key = this.parseString();
      if (keys.has(key)) this.fail('duplicate-key');
      if (UNSAFE_KEYS.has(key)) this.fail('unsafe-key');
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.offset] !== ':') this.fail('invalid-json');
      this.offset += 1;
      this.skipWhitespace();
      object[key] = this.parseValue(depth + 1);
      this.skipWhitespace();
      const separator = this.source[this.offset];
      if (separator === '}') {
        this.offset += 1;
        return object;
      }
      if (separator !== ',') this.fail('invalid-json');
      this.offset += 1;
      this.skipWhitespace();
    }
    return this.fail('invalid-json');
  }

  private parseArray(depth: number): unknown[] {
    this.offset += 1;
    const values: unknown[] = [];
    this.skipWhitespace();
    if (this.source[this.offset] === ']') {
      this.offset += 1;
      return values;
    }
    while (this.offset < this.source.length) {
      values.push(this.parseValue(depth + 1));
      this.skipWhitespace();
      const separator = this.source[this.offset];
      if (separator === ']') {
        this.offset += 1;
        return values;
      }
      if (separator !== ',') this.fail('invalid-json');
      this.offset += 1;
      this.skipWhitespace();
    }
    return this.fail('invalid-json');
  }

  private parseString(): string {
    const start = this.offset;
    this.offset += 1;
    while (this.offset < this.source.length) {
      const character = this.source[this.offset];
      if (character === '"') {
        this.offset += 1;
        try {
          return JSON.parse(this.source.slice(start, this.offset)) as string;
        } catch {
          return this.fail('invalid-json');
        }
      }
      if (character === '\\') {
        this.offset += 1;
        const escape = this.source[this.offset];
        if (escape === 'u') {
          const digits = this.source.slice(this.offset + 1, this.offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) this.fail('invalid-json');
          this.offset += 5;
          continue;
        }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) this.fail('invalid-json');
      } else {
        if (character === undefined || character.charCodeAt(0) < 0x20) this.fail('invalid-json');
      }
      this.offset += 1;
    }
    return this.fail('invalid-json');
  }

  private parseNumber(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.offset));
    if (!match) return this.fail('invalid-json');
    this.offset += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) return this.fail('invalid-json');
    return number;
  }

  private consumeLiteral<T>(literal: string, value: T): T {
    this.offset += literal.length;
    return value;
  }

  private skipWhitespace(): void {
    while (this.offset < this.source.length && ' \t\r\n'.includes(this.source[this.offset])) this.offset += 1;
  }

  private fail(code: PersonalVocabularyErrorCode): never {
    throw new ContractError(code);
  }
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function decodePayload(payload: string | Uint8Array): string {
  const byteLength = typeof payload === 'string'
    ? new TextEncoder().encode(payload).byteLength
    : payload.byteLength;
  if (byteLength > PERSONAL_VOCABULARY_LIMITS.maxPayloadBytes) throw new ContractError('payload-too-large');
  if (typeof payload === 'string') return payload;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(payload);
  } catch {
    throw new ContractError('invalid-encoding');
  }
}

function documentFromUnknown(value: unknown): PersonalVocabularyDocument {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new ContractError('invalid-schema');
  const root = value as Record<string, unknown>;
  const rootKeys = Object.keys(root);
  if (rootKeys.length !== 2 || !rootKeys.includes('version') || !rootKeys.includes('mappings')) {
    throw new ContractError('invalid-schema');
  }
  if (root.version !== PERSONAL_VOCABULARY_LIMITS.schemaVersion) throw new ContractError('invalid-schema');
  if (root.mappings === null || Array.isArray(root.mappings) || typeof root.mappings !== 'object') {
    throw new ContractError('invalid-schema');
  }

  const inputMappings = root.mappings as Record<string, unknown>;
  const entries = Object.entries(inputMappings);
  if (entries.length > PERSONAL_VOCABULARY_LIMITS.maxEntries) throw new ContractError('too-many-entries');
  const mappings: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, replacement] of entries) {
    const keyLength = codePointLength(key);
    if (keyLength === 0 || keyLength > PERSONAL_VOCABULARY_LIMITS.maxKeyLength || key.trim().length === 0) {
      throw new ContractError('invalid-key');
    }
    if (typeof replacement !== 'string' || codePointLength(replacement) > PERSONAL_VOCABULARY_LIMITS.maxValueLength) {
      throw new ContractError('invalid-value');
    }
    mappings[key] = replacement;
  }
  return Object.freeze({
    version: PERSONAL_VOCABULARY_LIMITS.schemaVersion,
    mappings: Object.freeze(mappings),
  });
}

function canonicalize(document: PersonalVocabularyDocument): string {
  const sortedMappings: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(document.mappings).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) {
    sortedMappings[key] = document.mappings[key];
  }
  return JSON.stringify({ version: PERSONAL_VOCABULARY_LIMITS.schemaVersion, mappings: sortedMappings });
}

/** Validate a complete upload or cache payload without partially applying it. */
export function validatePersonalVocabulary(payload: string | Uint8Array): PersonalVocabularyValidationResult {
  try {
    const source = decodePayload(payload);
    const parsed = new BoundedJsonParser(source).parse();
    const document = documentFromUnknown(parsed);
    return Object.freeze({ ok: true, document, canonicalCache: canonicalize(document) });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : 'invalid-json';
    return Object.freeze({ ok: false, code, message: NEUTRAL_ERROR_MESSAGE });
  }
}

/** Revalidate private cache bytes before every load. */
export function loadPersonalVocabularyCache(payload: string | Uint8Array): PersonalVocabularyValidationResult {
  return validatePersonalVocabulary(payload);
}

/** Return the canonical cache representation of an already validated document. */
export function serializePersonalVocabularyCache(document: PersonalVocabularyDocument): string {
  const validation = validatePersonalVocabulary(JSON.stringify(document));
  if (!validation.ok) throw new ContractError(validation.code);
  return validation.canonicalCache;
}

/** Apply mappings once, longest key first, while letting callers preserve technical spans. */
export function applyPersonalVocabulary(
  input: string,
  document: PersonalVocabularyDocument,
  options: PersonalVocabularyReplacementOptions = {},
): string {
  const keys = Object.keys(document.mappings)
    .filter((key) => key.length > 0 && typeof document.mappings[key] === 'string')
    .sort((left, right) => right.length - left.length || (left < right ? -1 : left > right ? 1 : 0));
  if (keys.length === 0 || input.length === 0) return input;
  let result = '';
  let offset = 0;
  while (offset < input.length) {
    const key = keys.find((candidate) => input.startsWith(candidate, offset));
    if (!key) {
      result += input[offset];
      offset += 1;
      continue;
    }
    const end = offset + key.length;
    result += options.preserveMatch?.(key, offset, end, input) ? key : document.mappings[key];
    offset = end;
  }
  return result;
}
