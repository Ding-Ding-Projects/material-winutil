/* Pure, bounded appearance data and colour mathematics. No storage or credential access lives here. */

export const APPEARANCE_SCHEMA_VERSION = 1 as const;

export const APPEARANCE_LIMITS = Object.freeze({
  maxJsonBytes: 512 * 1024,
  maxDepth: 12,
  maxTargets: 512,
  maxStatesPerTarget: 24,
  maxPresets: 128,
  maxThemes: 64,
  maxLocks: 2048,
  maxIdCodePoints: 96,
  maxNameCodePoints: 128,
  maxExplanationCodePoints: 512,
  maxRevision: Number.MAX_SAFE_INTEGER,
});

export const APPEARANCE_PSEUDO_STATES = Object.freeze([
  'base', 'hover', 'focus', 'focus-visible', 'active', 'disabled', 'selected',
  'checked', 'indeterminate', 'expanded', 'collapsed', 'visited', 'dragged',
  'drop-target', 'pressed', 'loading', 'error',
] as const);
export type AppearancePseudoState = typeof APPEARANCE_PSEUDO_STATES[number];

export const APPEARANCE_PROPERTIES = Object.freeze([
  'theme', 'density', 'seedColor', 'accentColor',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'underlineStyle', 'underlineColor', 'strikethrough', 'overline',
  'capitalization', 'smallCaps', 'verticalAlign', 'textColor', 'highlightColor',
  'outline', 'shadow', 'glow', 'characterSpacing', 'wordSpacing', 'lineHeight',
  'baselineOffset', 'textDirection', 'textAlignment',
  'shape', 'cornerRadius', 'elevation', 'motion', 'icon', 'spacing',
] as const);
export type AppearanceProperty = typeof APPEARANCE_PROPERTIES[number];

export type ColorSpace = 'hex' | 'rgb' | 'hsl' | 'hsv' | 'hwb' | 'lab' | 'lch' | 'oklab' | 'oklch' | 'cmyk';
export type ColorValue =
  | { space: 'hex'; value: string }
  | { space: 'rgb'; r: number; g: number; b: number; alpha?: number }
  | { space: 'hsl'; h: number; s: number; l: number; alpha?: number }
  | { space: 'hsv'; h: number; s: number; v: number; alpha?: number }
  | { space: 'hwb'; h: number; w: number; b: number; alpha?: number }
  | { space: 'lab'; l: number; a: number; b: number; alpha?: number }
  | { space: 'lch'; l: number; c: number; h: number; alpha?: number }
  | { space: 'oklab'; l: number; a: number; b: number; alpha?: number }
  | { space: 'oklch'; l: number; c: number; h: number; alpha?: number }
  | { space: 'cmyk'; c: number; m: number; y: number; k: number; alpha?: number };

export interface CanonicalColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export interface ColorConversion {
  sourceSpace: ColorSpace;
  targetSpace: ColorSpace;
  canonical: CanonicalColor;
  value: ColorValue;
  inGamut: boolean;
  clipped: boolean;
  clippedChannels: readonly string[];
}

export interface ContrastResult {
  ratio: number;
  normalTextAA: boolean;
  normalTextAAA: boolean;
  largeTextAA: boolean;
  largeTextAAA: boolean;
}

export interface AppearanceCapability {
  supported: boolean;
  explanation?: string;
}

export type AppearanceValue = string | number | boolean | ColorValue | Readonly<Record<string, unknown>>;
export type AppearancePropertySetting =
  | { mode: 'inherit' }
  | { mode: 'value'; value: AppearanceValue; capability?: AppearanceCapability };

export interface AppearanceStateOverride {
  state: AppearancePseudoState;
  properties: Partial<Record<AppearanceProperty, AppearancePropertySetting>>;
}

export interface AppearanceTarget {
  id: string;
  parentId: string | null;
  states: readonly AppearanceStateOverride[];
}

export interface NamedAppearanceValues {
  id: string;
  name: string;
  properties: Partial<Record<AppearanceProperty, AppearancePropertySetting>>;
}

export interface AppearanceLockMetadata {
  id: string;
  method: 'password' | 'totp';
  targetId: string | null;
  state: AppearancePseudoState | null;
  property: AppearanceProperty | null;
}

export interface AppearanceDocument {
  schemaVersion: typeof APPEARANCE_SCHEMA_VERSION;
  revision: number;
  rootTargetId: string;
  targets: readonly AppearanceTarget[];
  presets: readonly NamedAppearanceValues[];
  userThemes: readonly NamedAppearanceValues[];
  locks: readonly AppearanceLockMetadata[];
}

export interface ComputedAppearance {
  targetId: string;
  state: AppearancePseudoState;
  values: Readonly<Record<AppearanceProperty, AppearanceValue>>;
  capabilities: Readonly<Partial<Record<AppearanceProperty, AppearanceCapability>>>;
  sources: Readonly<Record<AppearanceProperty, string>>;
}

const PROPERTY_SET = new Set<string>(APPEARANCE_PROPERTIES);
const STATE_SET = new Set<string>(APPEARANCE_PSEUDO_STATES);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

const color = (value: string): ColorValue => ({ space: 'hex', value });
export const DEFAULT_APPEARANCE_VALUES: Readonly<Record<AppearanceProperty, AppearanceValue>> = Object.freeze({
  theme: 'system', density: 'comfortable', seedColor: color('#6750a4'), accentColor: color('#6750a4'),
  fontFamily: 'Segoe UI', fontSize: 16, fontWeight: 400, fontStyle: 'normal',
  underlineStyle: 'none', underlineColor: color('#00000000'), strikethrough: 'none', overline: false,
  capitalization: 'none', smallCaps: false, verticalAlign: 'normal', textColor: color('#1d1b20'),
  highlightColor: color('#00000000'), outline: Object.freeze({ width: 0, color: color('#00000000') }),
  shadow: Object.freeze({ x: 0, y: 0, blur: 0, spread: 0, color: color('#00000000') }),
  glow: Object.freeze({ radius: 0, color: color('#00000000') }), characterSpacing: 0, wordSpacing: 0,
  lineHeight: 1.4, baselineOffset: 0, textDirection: 'auto', textAlignment: 'start', shape: 'rounded',
  cornerRadius: 12, elevation: 0, motion: Object.freeze({ durationMs: 200, easing: 'standard' }),
  icon: Object.freeze({ name: '', size: 24, position: 'start' }),
  spacing: Object.freeze({ inline: 8, block: 8, gap: 8 }),
});

function fail(message: string): never { throw new TypeError(`Invalid appearance document: ${message}`); }
function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${name} must be a plain object`);
  for (const key of Object.keys(value)) if (UNSAFE_KEYS.has(key)) fail(`${name} contains unsafe key ${key}`);
  return value;
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) if (!set.has(key)) fail(`${name} contains unknown field ${key}`);
}
function codePoints(value: string): number { return Array.from(value).length; }
function boundedText(value: unknown, name: string, maximum: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.length === 0 || CONTROL.test(value) || codePoints(value) > maximum) fail(`${name} is invalid`);
  if (pattern && !pattern.test(value)) fail(`${name} has an invalid format`);
  return value;
}
function finite(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${name} is out of range`);
  return Object.is(value, -0) ? 0 : value;
}
function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  const result = finite(value, name, minimum, maximum);
  if (!Number.isInteger(result)) fail(`${name} must be an integer`);
  return result;
}
function oneOf(value: unknown, values: readonly string[], name: string): string {
  if (typeof value !== 'string' || !values.includes(value)) fail(`${name} is invalid`);
  return value;
}
function cloneValue<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}
function assertBoundedTree(value: unknown): void {
  let nodes = 0;
  const visit = (current: unknown, depth: number): void => {
    if (depth > APPEARANCE_LIMITS.maxDepth) fail('maximum nesting depth exceeded');
    if (current === null || typeof current !== 'object') return;
    nodes += 1;
    if (nodes > 50000) fail('object count exceeded');
    if (Array.isArray(current)) for (const item of current) visit(item, depth + 1);
    else {
      const currentRecord = record(current, 'nested value');
      for (const item of Object.values(currentRecord)) visit(item, depth + 1);
    }
  };
  visit(value, 0);
}

function validateAlpha(value: unknown): number { return value === undefined ? 1 : finite(value, 'alpha', 0, 1); }
function validateHue(value: unknown): number { return finite(value, 'hue', -1e9, 1e9); }

export function validateColor(value: unknown): ColorValue {
  const input = record(value, 'color');
  const space = oneOf(input.space, ['hex', 'rgb', 'hsl', 'hsv', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'cmyk'], 'color space') as ColorSpace;
  const alpha = input.alpha;
  switch (space) {
    case 'hex': {
      exactKeys(input, ['space', 'value'], 'hex color');
      const hex = boundedText(input.value, 'hex color', 9);
      if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(hex)) fail('hex color is invalid');
      return { space, value: hex.toLowerCase() };
    }
    case 'rgb':
      exactKeys(input, ['space', 'r', 'g', 'b', 'alpha'], 'rgb color');
      return { space, r: finite(input.r, 'red', 0, 255), g: finite(input.g, 'green', 0, 255), b: finite(input.b, 'blue', 0, 255), alpha: validateAlpha(alpha) };
    case 'hsl':
      exactKeys(input, ['space', 'h', 's', 'l', 'alpha'], 'hsl color');
      return { space, h: validateHue(input.h), s: finite(input.s, 'saturation', 0, 1), l: finite(input.l, 'lightness', 0, 1), alpha: validateAlpha(alpha) };
    case 'hsv':
      exactKeys(input, ['space', 'h', 's', 'v', 'alpha'], 'hsv color');
      return { space, h: validateHue(input.h), s: finite(input.s, 'saturation', 0, 1), v: finite(input.v, 'value', 0, 1), alpha: validateAlpha(alpha) };
    case 'hwb':
      exactKeys(input, ['space', 'h', 'w', 'b', 'alpha'], 'hwb color');
      return { space, h: validateHue(input.h), w: finite(input.w, 'whiteness', 0, 1), b: finite(input.b, 'blackness', 0, 1), alpha: validateAlpha(alpha) };
    case 'lab':
      exactKeys(input, ['space', 'l', 'a', 'b', 'alpha'], 'lab color');
      return { space, l: finite(input.l, 'Lab lightness', 0, 100), a: finite(input.a, 'Lab a', -200, 200), b: finite(input.b, 'Lab b', -200, 200), alpha: validateAlpha(alpha) };
    case 'lch':
      exactKeys(input, ['space', 'l', 'c', 'h', 'alpha'], 'lch color');
      return { space, l: finite(input.l, 'LCH lightness', 0, 100), c: finite(input.c, 'LCH chroma', 0, 300), h: validateHue(input.h), alpha: validateAlpha(alpha) };
    case 'oklab':
      exactKeys(input, ['space', 'l', 'a', 'b', 'alpha'], 'oklab color');
      return { space, l: finite(input.l, 'OKLab lightness', 0, 1), a: finite(input.a, 'OKLab a', -1, 1), b: finite(input.b, 'OKLab b', -1, 1), alpha: validateAlpha(alpha) };
    case 'oklch':
      exactKeys(input, ['space', 'l', 'c', 'h', 'alpha'], 'oklch color');
      return { space, l: finite(input.l, 'OKLCH lightness', 0, 1), c: finite(input.c, 'OKLCH chroma', 0, 1), h: validateHue(input.h), alpha: validateAlpha(alpha) };
    case 'cmyk':
      exactKeys(input, ['space', 'c', 'm', 'y', 'k', 'alpha'], 'cmyk color');
      return { space, c: finite(input.c, 'cyan', 0, 1), m: finite(input.m, 'magenta', 0, 1), y: finite(input.y, 'yellow', 0, 1), k: finite(input.k, 'key', 0, 1), alpha: validateAlpha(alpha) };
  }
}

const clamp = (value: number, minimum = 0, maximum = 1): number => Math.min(maximum, Math.max(minimum, value));
const hue = (value: number): number => ((value % 360) + 360) % 360;
const radians = (degrees: number): number => degrees * Math.PI / 180;
const degrees = (radiansValue: number): number => hue(radiansValue * 180 / Math.PI);
const srgbToLinear = (value: number): number => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (value: number): number => value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;

function hueRgb(h: number, c: number, x: number): [number, number, number] {
  if (h < 60) return [c, x, 0];
  if (h < 120) return [x, c, 0];
  if (h < 180) return [0, c, x];
  if (h < 240) return [0, x, c];
  if (h < 300) return [x, 0, c];
  return [c, 0, x];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const maximum = Math.max(r, g, b); const minimum = Math.min(r, g, b); const delta = maximum - minimum;
  let h = 0;
  if (delta !== 0) {
    if (maximum === r) h = 60 * (((g - b) / delta) % 6);
    else if (maximum === g) h = 60 * (((b - r) / delta) + 2);
    else h = 60 * (((r - g) / delta) + 4);
  }
  return [hue(h), maximum === 0 ? 0 : delta / maximum, maximum];
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r); const gl = srgbToLinear(g); const bl = srgbToLinear(b);
  return [
    rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175,
    rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041,
  ];
}

function xyzToRgb(x: number, y: number, z: number): [number, number, number] {
  return [
    linearToSrgb(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    linearToSrgb(x * -0.969266 + y * 1.8760108 + z * 0.041556),
    linearToSrgb(x * 0.0556434 + y * -0.2040259 + z * 1.0572252),
  ];
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const f = (v: number): number => v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116;
  const fx = f(x / 0.95047); const fy = f(y); const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToXyz(l: number, a: number, b: number): [number, number, number] {
  const fy = (l + 16) / 116; const fx = fy + a / 500; const fz = fy - b / 200;
  const inverse = (v: number): number => v ** 3 > 216 / 24389 ? v ** 3 : (116 * v - 16) / (24389 / 27);
  return [0.95047 * inverse(fx), inverse(fy), 1.08883 * inverse(fz)];
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r); const gl = srgbToLinear(g); const bl = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function oklabToRgb(l: number, a: number, b: number): [number, number, number] {
  const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const ss = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [linearToSrgb(4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss), linearToSrgb(-1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss), linearToSrgb(-0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss)];
}

function canonicalFrom(value: ColorValue): { raw: [number, number, number]; alpha: number } {
  switch (value.space) {
    case 'hex': {
      let raw = value.value.slice(1);
      if (raw.length <= 4) raw = [...raw].map((digit) => digit + digit).join('');
      const alpha = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
      return { raw: [parseInt(raw.slice(0, 2), 16) / 255, parseInt(raw.slice(2, 4), 16) / 255, parseInt(raw.slice(4, 6), 16) / 255], alpha };
    }
    case 'rgb': return { raw: [value.r / 255, value.g / 255, value.b / 255], alpha: value.alpha ?? 1 };
    case 'hsl': {
      const h = hue(value.h); const c = (1 - Math.abs(2 * value.l - 1)) * value.s; const x = c * (1 - Math.abs((h / 60) % 2 - 1)); const m = value.l - c / 2;
      const rgb = hueRgb(h, c, x); return { raw: [rgb[0] + m, rgb[1] + m, rgb[2] + m], alpha: value.alpha ?? 1 };
    }
    case 'hsv': {
      const h = hue(value.h); const c = value.v * value.s; const x = c * (1 - Math.abs((h / 60) % 2 - 1)); const m = value.v - c;
      const rgb = hueRgb(h, c, x); return { raw: [rgb[0] + m, rgb[1] + m, rgb[2] + m], alpha: value.alpha ?? 1 };
    }
    case 'hwb': {
      let w = value.w; let black = value.b;
      if (w + black >= 1) { const gray = w / (w + black); return { raw: [gray, gray, gray], alpha: value.alpha ?? 1 }; }
      const pure = canonicalFrom({ space: 'hsv', h: value.h, s: 1, v: 1, alpha: value.alpha });
      return { raw: pure.raw.map((channel) => channel * (1 - w - black) + w) as [number, number, number], alpha: value.alpha ?? 1 };
    }
    case 'lab': return { raw: xyzToRgb(...labToXyz(value.l, value.a, value.b)), alpha: value.alpha ?? 1 };
    case 'lch': return canonicalFrom({ space: 'lab', l: value.l, a: value.c * Math.cos(radians(value.h)), b: value.c * Math.sin(radians(value.h)), alpha: value.alpha });
    case 'oklab': return { raw: oklabToRgb(value.l, value.a, value.b), alpha: value.alpha ?? 1 };
    case 'oklch': return canonicalFrom({ space: 'oklab', l: value.l, a: value.c * Math.cos(radians(value.h)), b: value.c * Math.sin(radians(value.h)), alpha: value.alpha });
    case 'cmyk': return { raw: [(1 - value.c) * (1 - value.k), (1 - value.m) * (1 - value.k), (1 - value.y) * (1 - value.k)], alpha: value.alpha ?? 1 };
  }
}

function round(value: number, precision = 8): number { return Number(value.toFixed(precision)); }
function hexByte(value: number): string { return Math.round(clamp(value) * 255).toString(16).padStart(2, '0'); }

function representation(colorValue: CanonicalColor, targetSpace: ColorSpace): ColorValue {
  const r = colorValue.r; const g = colorValue.g; const b = colorValue.b; const alpha = colorValue.alpha;
  if (targetSpace === 'hex') return { space: 'hex', value: `#${hexByte(r)}${hexByte(g)}${hexByte(b)}${alpha < 1 ? hexByte(alpha) : ''}` };
  if (targetSpace === 'rgb') return { space: 'rgb', r: round(r * 255), g: round(g * 255), b: round(b * 255), alpha: round(alpha) };
  const hsv = rgbToHsv(r, g, b);
  if (targetSpace === 'hsv') return { space: 'hsv', h: round(hsv[0]), s: round(hsv[1]), v: round(hsv[2]), alpha: round(alpha) };
  if (targetSpace === 'hsl') {
    const maximum = Math.max(r, g, b); const minimum = Math.min(r, g, b); const lightness = (maximum + minimum) / 2; const delta = maximum - minimum;
    return { space: 'hsl', h: round(hsv[0]), s: round(delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))), l: round(lightness), alpha: round(alpha) };
  }
  if (targetSpace === 'hwb') return { space: 'hwb', h: round(hsv[0]), w: round(Math.min(r, g, b)), b: round(1 - Math.max(r, g, b)), alpha: round(alpha) };
  if (targetSpace === 'cmyk') {
    const k = 1 - Math.max(r, g, b); const denominator = 1 - k;
    return { space: 'cmyk', c: round(denominator === 0 ? 0 : (1 - r - k) / denominator), m: round(denominator === 0 ? 0 : (1 - g - k) / denominator), y: round(denominator === 0 ? 0 : (1 - b - k) / denominator), k: round(k), alpha: round(alpha) };
  }
  if (targetSpace === 'lab' || targetSpace === 'lch') {
    const lab = xyzToLab(...rgbToXyz(r, g, b));
    if (targetSpace === 'lab') return { space: 'lab', l: round(lab[0]), a: round(lab[1]), b: round(lab[2]), alpha: round(alpha) };
    return { space: 'lch', l: round(lab[0]), c: round(Math.hypot(lab[1], lab[2])), h: round(degrees(Math.atan2(lab[2], lab[1]))), alpha: round(alpha) };
  }
  const lab = rgbToOklab(r, g, b);
  if (targetSpace === 'oklab') return { space: 'oklab', l: round(lab[0]), a: round(lab[1]), b: round(lab[2]), alpha: round(alpha) };
  return { space: 'oklch', l: round(lab[0]), c: round(Math.hypot(lab[1], lab[2])), h: round(degrees(Math.atan2(lab[2], lab[1]))), alpha: round(alpha) };
}

export function convertColor(input: ColorValue, targetSpace: ColorSpace): ColorConversion {
  const valid = validateColor(input);
  oneOf(targetSpace, ['hex', 'rgb', 'hsl', 'hsv', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'cmyk'], 'target color space');
  const converted = canonicalFrom(valid);
  const names = ['red', 'green', 'blue'];
  const clippedChannels = converted.raw.flatMap((channel, index) => channel < -1e-7 || channel > 1 + 1e-7 ? [names[index]] : []);
  const canonical = Object.freeze({ r: clamp(converted.raw[0]), g: clamp(converted.raw[1]), b: clamp(converted.raw[2]), alpha: clamp(converted.alpha) });
  return Object.freeze({ sourceSpace: valid.space, targetSpace, canonical, value: freezeDeep(representation(canonical, targetSpace)), inGamut: clippedChannels.length === 0, clipped: clippedChannels.length !== 0, clippedChannels: Object.freeze(clippedChannels) });
}

function composite(foreground: CanonicalColor, background: CanonicalColor): CanonicalColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) return { r: 0, g: 0, b: 0, alpha: 0 };
  return {
    r: (foreground.r * foreground.alpha + background.r * background.alpha * (1 - foreground.alpha)) / alpha,
    g: (foreground.g * foreground.alpha + background.g * background.alpha * (1 - foreground.alpha)) / alpha,
    b: (foreground.b * foreground.alpha + background.b * background.alpha * (1 - foreground.alpha)) / alpha,
    alpha,
  };
}

export function contrastRatio(foreground: ColorValue, background: ColorValue): ContrastResult {
  const fg = convertColor(foreground, 'rgb').canonical; const bg = convertColor(background, 'rgb').canonical;
  const opaqueBackground = composite(bg, { r: 1, g: 1, b: 1, alpha: 1 });
  const visibleForeground = composite(fg, opaqueBackground);
  const luminance = (c: CanonicalColor): number => 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
  const first = luminance(visibleForeground); const second = luminance(opaqueBackground);
  const ratio = round((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05), 4);
  return Object.freeze({ ratio, normalTextAA: ratio >= 4.5, normalTextAAA: ratio >= 7, largeTextAA: ratio >= 3, largeTextAAA: ratio >= 4.5 });
}

function validateStructuredValue(value: unknown, property: AppearanceProperty): AppearanceValue {
  const object = record(value, property);
  const colorFields = ['color'];
  const expected = property === 'outline' ? ['width', ...colorFields]
    : property === 'shadow' ? ['x', 'y', 'blur', 'spread', ...colorFields]
      : property === 'glow' ? ['radius', ...colorFields]
        : property === 'motion' ? ['durationMs', 'easing']
          : property === 'icon' ? ['name', 'size', 'position']
            : ['inline', 'block', 'gap'];
  exactKeys(object, expected, property);
  for (const key of expected) if (!(key in object)) fail(`${property} is missing ${key}`);
  const result = cloneValue(object);
  if ('color' in result) result.color = validateColor(result.color);
  for (const key of ['width', 'x', 'y', 'blur', 'spread', 'radius', 'durationMs', 'size', 'inline', 'block', 'gap']) {
    if (key in result) result[key] = finite(result[key], `${property}.${key}`, key === 'x' || key === 'y' ? -4096 : 0, 4096);
  }
  if ('easing' in result) result.easing = boundedText(result.easing, 'motion.easing', 64);
  if ('name' in result) result.name = typeof result.name === 'string' && result.name.length === 0 ? '' : boundedText(result.name, 'icon.name', 128);
  if ('position' in result) result.position = oneOf(result.position, ['start', 'end', 'above', 'below', 'only'], 'icon.position');
  return result;
}

function validatePropertyValue(property: AppearanceProperty, value: unknown): AppearanceValue {
  if (['seedColor', 'accentColor', 'underlineColor', 'textColor', 'highlightColor'].includes(property)) return validateColor(value);
  if (['outline', 'shadow', 'glow', 'motion', 'icon', 'spacing'].includes(property)) return validateStructuredValue(value, property);
  if (property === 'overline' || property === 'smallCaps') { if (typeof value !== 'boolean') fail(`${property} must be boolean`); return value; }
  const ranges: Partial<Record<AppearanceProperty, [number, number]>> = {
    fontSize: [1, 512], fontWeight: [1, 1000], characterSpacing: [-100, 100], wordSpacing: [-100, 100],
    lineHeight: [0.1, 20], baselineOffset: [-512, 512], cornerRadius: [0, 2048], elevation: [0, 24],
  };
  if (ranges[property]) return finite(value, property, ranges[property]![0], ranges[property]![1]);
  if (property === 'fontFamily') return boundedText(value, property, 128);
  const enums: Partial<Record<AppearanceProperty, readonly string[]>> = {
    theme: ['system', 'light', 'dark', 'high-contrast'], density: ['compact', 'comfortable', 'spacious'],
    fontStyle: ['normal', 'italic', 'oblique'], underlineStyle: ['none', 'single', 'double', 'dotted', 'dashed', 'wavy'],
    strikethrough: ['none', 'single', 'double'], capitalization: ['none', 'uppercase', 'lowercase', 'capitalize'],
    verticalAlign: ['normal', 'superscript', 'subscript'], textDirection: ['auto', 'ltr', 'rtl'],
    textAlignment: ['start', 'center', 'end', 'justify'], shape: ['square', 'rounded', 'pill', 'custom'],
  };
  if (enums[property]) return oneOf(value, enums[property]!, property);
  return fail(`${property} has no validator`);
}

function validateSetting(value: unknown, property: AppearanceProperty): AppearancePropertySetting {
  const input = record(value, `${property} setting`);
  const mode = oneOf(input.mode, ['inherit', 'value'], `${property}.mode`);
  if (mode === 'inherit') { exactKeys(input, ['mode'], `${property} inherit setting`); return { mode: 'inherit' }; }
  exactKeys(input, ['mode', 'value', 'capability'], `${property} value setting`);
  let capability: AppearanceCapability | undefined;
  if (input.capability !== undefined) {
    const metadata = record(input.capability, `${property}.capability`);
    exactKeys(metadata, ['supported', 'explanation'], `${property}.capability`);
    if (typeof metadata.supported !== 'boolean') fail(`${property}.capability.supported must be boolean`);
    if (!metadata.supported && metadata.explanation === undefined) fail(`${property} unsupported value needs an explanation`);
    capability = { supported: metadata.supported };
    if (metadata.explanation !== undefined) capability.explanation = boundedText(metadata.explanation, `${property}.capability.explanation`, APPEARANCE_LIMITS.maxExplanationCodePoints);
  }
  const setting: AppearancePropertySetting = { mode: 'value', value: validatePropertyValue(property, input.value) };
  if (capability) setting.capability = capability;
  return setting;
}

function validateProperties(value: unknown, name: string): Partial<Record<AppearanceProperty, AppearancePropertySetting>> {
  const input = record(value, name); const output: Partial<Record<AppearanceProperty, AppearancePropertySetting>> = {};
  for (const property of Object.keys(input)) {
    if (!PROPERTY_SET.has(property)) fail(`${name} contains unknown property ${property}`);
    output[property as AppearanceProperty] = validateSetting(input[property], property as AppearanceProperty);
  }
  const ordered: Partial<Record<AppearanceProperty, AppearancePropertySetting>> = {};
  for (const property of APPEARANCE_PROPERTIES) if (output[property]) ordered[property] = output[property];
  return ordered;
}

function validateNamedValues(value: unknown, name: string): NamedAppearanceValues {
  const input = record(value, name); exactKeys(input, ['id', 'name', 'properties'], name);
  return { id: boundedText(input.id, `${name}.id`, APPEARANCE_LIMITS.maxIdCodePoints, ID_PATTERN), name: boundedText(input.name, `${name}.name`, APPEARANCE_LIMITS.maxNameCodePoints), properties: validateProperties(input.properties, `${name}.properties`) };
}

function uniqueIds<T extends { id: string }>(items: readonly T[], name: string): void {
  const ids = new Set<string>();
  for (const item of items) { if (ids.has(item.id)) fail(`${name} contains duplicate id ${item.id}`); ids.add(item.id); }
}

export function validateAppearanceDocument(value: unknown): AppearanceDocument {
  assertBoundedTree(value);
  const input = record(value, 'document');
  exactKeys(input, ['schemaVersion', 'revision', 'rootTargetId', 'targets', 'presets', 'userThemes', 'locks'], 'document');
  if (input.schemaVersion !== APPEARANCE_SCHEMA_VERSION) fail('unsupported schema version');
  const revision = integer(input.revision, 'revision', 0, APPEARANCE_LIMITS.maxRevision);
  const rootTargetId = boundedText(input.rootTargetId, 'rootTargetId', APPEARANCE_LIMITS.maxIdCodePoints, ID_PATTERN);
  if (!Array.isArray(input.targets) || input.targets.length === 0 || input.targets.length > APPEARANCE_LIMITS.maxTargets) fail('targets are out of bounds');
  const targets = input.targets.map((candidate, targetIndex): AppearanceTarget => {
    const target = record(candidate, `targets[${targetIndex}]`); exactKeys(target, ['id', 'parentId', 'states'], `targets[${targetIndex}]`);
    const id = boundedText(target.id, `targets[${targetIndex}].id`, APPEARANCE_LIMITS.maxIdCodePoints, ID_PATTERN);
    const parentId = target.parentId === null ? null : boundedText(target.parentId, `targets[${targetIndex}].parentId`, APPEARANCE_LIMITS.maxIdCodePoints, ID_PATTERN);
    if (!Array.isArray(target.states) || target.states.length > APPEARANCE_LIMITS.maxStatesPerTarget) fail(`${id}.states are out of bounds`);
    const states = target.states.map((candidateState, stateIndex): AppearanceStateOverride => {
      const state = record(candidateState, `${id}.states[${stateIndex}]`); exactKeys(state, ['state', 'properties'], `${id}.states[${stateIndex}]`);
      const stateName = oneOf(state.state, APPEARANCE_PSEUDO_STATES, `${id}.state`) as AppearancePseudoState;
      return { state: stateName, properties: validateProperties(state.properties, `${id}.${stateName}.properties`) };
    });
    const names = new Set(states.map((state) => state.state)); if (names.size !== states.length) fail(`${id} contains duplicate states`);
    states.sort((a, b) => APPEARANCE_PSEUDO_STATES.indexOf(a.state) - APPEARANCE_PSEUDO_STATES.indexOf(b.state));
    return { id, parentId, states };
  });
  uniqueIds(targets, 'targets');
  const targetMap = new Map(targets.map((target) => [target.id, target]));
  const root = targetMap.get(rootTargetId); if (!root || root.parentId !== null) fail('root target is missing or has a parent');
  for (const target of targets) if (target.id !== rootTargetId && (target.parentId === null || !targetMap.has(target.parentId))) fail(`${target.id} has an invalid parent`);
  for (const target of targets) {
    const seen = new Set<string>(); let cursor: AppearanceTarget | undefined = target;
    while (cursor) { if (seen.has(cursor.id)) fail('target inheritance contains a cycle'); seen.add(cursor.id); cursor = cursor.parentId === null ? undefined : targetMap.get(cursor.parentId); }
  }
  const array = (candidate: unknown, name: string, maximum: number): unknown[] => { if (!Array.isArray(candidate) || candidate.length > maximum) fail(`${name} is out of bounds`); return candidate; };
  const presets = array(input.presets, 'presets', APPEARANCE_LIMITS.maxPresets).map((item, index) => validateNamedValues(item, `presets[${index}]`));
  const userThemes = array(input.userThemes, 'userThemes', APPEARANCE_LIMITS.maxThemes).map((item, index) => validateNamedValues(item, `userThemes[${index}]`));
  uniqueIds(presets, 'presets'); uniqueIds(userThemes, 'userThemes');
  const locks = array(input.locks, 'locks', APPEARANCE_LIMITS.maxLocks).map((candidate, index): AppearanceLockMetadata => {
    const lock = record(candidate, `locks[${index}]`); exactKeys(lock, ['id', 'method', 'targetId', 'state', 'property'], `locks[${index}]`);
    const targetId = lock.targetId === null ? null : boundedText(lock.targetId, `locks[${index}].targetId`, APPEARANCE_LIMITS.maxIdCodePoints, ID_PATTERN);
    if (targetId !== null && !targetMap.has(targetId)) fail(`lock ${String(lock.id)} references an unknown target`);
    const state = lock.state === null ? null : oneOf(lock.state, APPEARANCE_PSEUDO_STATES, `locks[${index}].state`) as AppearancePseudoState;
    const property = lock.property === null ? null : oneOf(lock.property, APPEARANCE_PROPERTIES, `locks[${index}].property`) as AppearanceProperty;
    if ((state !== null || property !== null) && targetId === null) fail(`lock ${String(lock.id)} needs a target`);
    return { id: boundedText(lock.id, `locks[${index}].id`, APPEARANCE_LIMITS.maxIdCodePoints, ID_PATTERN), method: oneOf(lock.method, ['password', 'totp'], `locks[${index}].method`) as 'password' | 'totp', targetId, state, property };
  });
  uniqueIds(locks, 'locks');
  targets.sort((a, b) => a.id.localeCompare(b.id)); presets.sort((a, b) => a.id.localeCompare(b.id)); userThemes.sort((a, b) => a.id.localeCompare(b.id)); locks.sort((a, b) => a.id.localeCompare(b.id));
  return freezeDeep({ schemaVersion: APPEARANCE_SCHEMA_VERSION, revision, rootTargetId, targets, presets, userThemes, locks });
}

export function createAppearanceDocument(rootTargetId = 'app-root'): AppearanceDocument {
  return validateAppearanceDocument({ schemaVersion: APPEARANCE_SCHEMA_VERSION, revision: 0, rootTargetId, targets: [{ id: rootTargetId, parentId: null, states: [] }], presets: [], userThemes: [], locks: [] });
}

export function parseAppearanceJson(payload: string | Uint8Array): AppearanceDocument {
  const size = typeof payload === 'string' ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
  if (size > APPEARANCE_LIMITS.maxJsonBytes) fail('JSON byte limit exceeded');
  let text: string;
  try { text = typeof payload === 'string' ? payload : new TextDecoder('utf-8', { fatal: true }).decode(payload); } catch { return fail('JSON is not valid UTF-8'); }
  try { return validateAppearanceDocument(JSON.parse(text) as unknown); } catch (error) { if (error instanceof TypeError && error.message.startsWith('Invalid appearance document:')) throw error; return fail('malformed JSON'); }
}

export function serializeAppearanceJson(document: AppearanceDocument): string { return JSON.stringify(validateAppearanceDocument(document)); }
export const exportAppearanceTheme = serializeAppearanceJson;
export const importAppearanceTheme = parseAppearanceJson;

function nextRevision(document: AppearanceDocument): number {
  if (document.revision >= APPEARANCE_LIMITS.maxRevision) fail('revision limit reached');
  return document.revision + 1;
}

function mutable(document: AppearanceDocument): AppearanceDocument & { targets: AppearanceTarget[]; presets: NamedAppearanceValues[]; userThemes: NamedAppearanceValues[]; locks: AppearanceLockMetadata[] } {
  return cloneValue(validateAppearanceDocument(document)) as AppearanceDocument & { targets: AppearanceTarget[]; presets: NamedAppearanceValues[]; userThemes: NamedAppearanceValues[]; locks: AppearanceLockMetadata[] };
}

export function setAppearanceProperty(document: AppearanceDocument, targetId: string, parentId: string | null, state: AppearancePseudoState, property: AppearanceProperty, setting: AppearancePropertySetting): AppearanceDocument {
  const draft = mutable(document); let target = draft.targets.find((item) => item.id === targetId);
  if (!target) { target = { id: targetId, parentId, states: [] }; draft.targets.push(target); }
  else if (target.parentId !== parentId) fail(`${targetId} parent cannot be changed implicitly`);
  let stateOverride = target.states.find((item) => item.state === state);
  if (!stateOverride) { stateOverride = { state, properties: {} }; (target.states as AppearanceStateOverride[]).push(stateOverride); }
  (stateOverride.properties as Partial<Record<AppearanceProperty, AppearancePropertySetting>>)[property] = cloneValue(setting);
  draft.revision = nextRevision(document); return validateAppearanceDocument(draft);
}

export function resetAppearanceProperty(document: AppearanceDocument, targetId: string, state: AppearancePseudoState, property: AppearanceProperty): AppearanceDocument {
  const draft = mutable(document); const target = draft.targets.find((item) => item.id === targetId); const stateOverride = target?.states.find((item) => item.state === state);
  if (!stateOverride || !(property in stateOverride.properties)) return document;
  delete (stateOverride.properties as Partial<Record<AppearanceProperty, AppearancePropertySetting>>)[property];
  target!.states = target!.states.filter((item) => Object.keys(item.properties).length > 0);
  draft.revision = nextRevision(document); return validateAppearanceDocument(draft);
}

export function resetAppearanceTarget(document: AppearanceDocument, targetId: string): AppearanceDocument {
  const draft = mutable(document); const target = draft.targets.find((item) => item.id === targetId); if (!target) return document;
  if (target.states.length === 0) return document;
  target.states = [];
  draft.revision = nextRevision(document); return validateAppearanceDocument(draft);
}

export function resetAllAppearance(document: AppearanceDocument): AppearanceDocument {
  const valid = validateAppearanceDocument(document);
  if (valid.targets.every((target) => target.states.length === 0)) return valid;
  return validateAppearanceDocument({ ...cloneValue(valid), revision: nextRevision(valid), targets: valid.targets.map((target) => ({ ...cloneValue(target), states: [] })) });
}

export function computeAppearance(document: AppearanceDocument, targetId: string, state: AppearancePseudoState = 'base'): ComputedAppearance {
  const valid = validateAppearanceDocument(document); const targets = new Map(valid.targets.map((target) => [target.id, target])); const target = targets.get(targetId); if (!target) fail(`unknown target ${targetId}`);
  const chain: AppearanceTarget[] = []; let cursor: AppearanceTarget | undefined = target;
  while (cursor) { chain.unshift(cursor); cursor = cursor.parentId === null ? undefined : targets.get(cursor.parentId); }
  const values = cloneValue(DEFAULT_APPEARANCE_VALUES) as Record<AppearanceProperty, AppearanceValue>; const sources = Object.fromEntries(APPEARANCE_PROPERTIES.map((property) => [property, 'default'])) as Record<AppearanceProperty, string>;
  const capabilities: Partial<Record<AppearanceProperty, AppearanceCapability>> = {};
  const apply = (owner: AppearanceTarget, stateName: AppearancePseudoState): void => {
    const override = owner.states.find((candidate) => candidate.state === stateName); if (!override) return;
    for (const property of APPEARANCE_PROPERTIES) {
      const setting = override.properties[property]; if (!setting || setting.mode === 'inherit') continue;
      values[property] = cloneValue(setting.value); sources[property] = `${owner.id}:${stateName}`;
      if (setting.capability) capabilities[property] = cloneValue(setting.capability); else delete capabilities[property];
    }
  };
  for (const owner of chain) { apply(owner, 'base'); if (state !== 'base') apply(owner, state); }
  return freezeDeep({ targetId, state, values, capabilities, sources });
}

export function applyNamedAppearance(document: AppearanceDocument, kind: 'preset' | 'userTheme', id: string, targetId: string, state: AppearancePseudoState = 'base'): AppearanceDocument {
  const valid = validateAppearanceDocument(document); const collection = kind === 'preset' ? valid.presets : valid.userThemes; const named = collection.find((item) => item.id === id); if (!named) fail(`unknown ${kind} ${id}`);
  let result = valid; const target = valid.targets.find((item) => item.id === targetId); if (!target) fail(`unknown target ${targetId}`);
  for (const property of APPEARANCE_PROPERTIES) { const setting = named.properties[property]; if (setting) result = setAppearanceProperty(result, targetId, target.parentId, state, property, setting); }
  return result;
}
