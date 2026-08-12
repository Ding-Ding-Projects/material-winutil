import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function channelsFor(colorType) {
  return ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType] ?? 0;
}

export async function inspectPng(file) {
  const bytes = await readFile(file);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error(`${file} is not a PNG file`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  const data = [];
  let sawHeader = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw new Error(`${file} has a truncated ${type} chunk`);
    const expectedCrc = bytes.readUInt32BE(end);
    const actualCrc = crc32(bytes.subarray(offset + 4, end));
    if (expectedCrc !== actualCrc) throw new Error(`${file} has an invalid ${type} CRC`);
    if (type === 'IHDR') {
      if (sawHeader || offset !== 8 || length !== 13) throw new Error(`${file} has an invalid IHDR chunk`);
      sawHeader = true;
      width = bytes.readUInt32BE(start);
      height = bytes.readUInt32BE(start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd) throw new Error(`${file} has IDAT in an invalid position`);
      data.push(bytes.subarray(start, end));
    } else if (type === 'IEND') {
      if (length !== 0) throw new Error(`${file} has an invalid IEND chunk`);
      sawEnd = true;
      break;
    }
    offset = end + 4;
  }

  if (!sawHeader || !sawEnd || !width || !height || !data.length) throw new Error(`${file} is missing required PNG chunks`);
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`${file} uses unsupported PNG encoding (bitDepth=${bitDepth}, interlace=${interlace})`);
  }
  const channels = channelsFor(colorType);
  if (!channels) throw new Error(`${file} uses unsupported PNG color type ${colorType}`);

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  if (raw.length !== (stride + 1) * height) throw new Error(`${file} has an invalid inflated byte length`);

  const decoded = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const input = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = decoded.subarray(y * stride, (y + 1) * stride);
    const prior = y ? decoded.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prior ? prior[x] : 0;
      const upLeft = prior && x >= channels ? prior[x - channels] : 0;
      const value = input[x];
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error(`${file} uses invalid PNG filter ${filter}`);
    }
  }

  const sampleStep = Math.max(channels, Math.floor(decoded.length / 20000 / channels) * channels);
  const colors = new Set();
  let opaquePixels = 0;
  for (let i = 0; i < decoded.length; i += sampleStep) {
    let r;
    let g;
    let b;
    let a = 255;
    if (colorType === 6) [r, g, b, a] = decoded.subarray(i, i + 4);
    else if (colorType === 2) [r, g, b] = decoded.subarray(i, i + 3);
    else if (colorType === 4) { r = g = b = decoded[i]; a = decoded[i + 1]; }
    else { r = g = b = decoded[i]; }
    if (a > 0) opaquePixels += 1;
    colors.add(`${r},${g},${b},${a}`);
    if (colors.size >= 32 && opaquePixels >= 32) break;
  }
  if (colors.size < 2 || opaquePixels === 0) throw new Error(`${file} is blank or uniform`);

  return {
    width,
    height,
    bytes: bytes.length,
    colorType,
    sampledColors: colors.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function assertUniquePngs(entries) {
  const seen = new Map();
  for (const entry of entries) {
    const prior = seen.get(entry.png.sha256);
    if (prior) throw new Error(`duplicate captures: ${prior} and ${entry.file}`);
    seen.set(entry.png.sha256, entry.file);
  }
}
