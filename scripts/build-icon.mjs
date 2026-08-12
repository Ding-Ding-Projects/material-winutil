import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'build', 'icon.ico');
const sizes = [16, 24, 32, 48, 64, 128, 256];

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name, 'ascii');
  const value = Buffer.alloc(12 + data.length);
  value.writeUInt32BE(data.length, 0); type.copy(value, 4); data.copy(value, 8);
  value.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + data.length);
  return value;
}

function asPng(size, pixels) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1); rows[row] = 0;
    pixels.copy(rows, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function paint(pixel, color, coverage) {
  const alpha = (color[3] / 255) * Math.max(0, Math.min(1, coverage));
  const previous = pixel[3] / 255; const total = alpha + previous * (1 - alpha);
  if (total === 0) return;
  for (let index = 0; index < 3; index += 1) pixel[index] = Math.round((color[index] * alpha + pixel[index] * previous * (1 - alpha)) / total);
  pixel[3] = Math.round(total * 255);
}

function rect(pixel, x, y, left, top, right, bottom, radius, color) {
  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  paint(pixel, color, .5 - (Math.hypot(x - nearestX, y - nearestY) - radius));
}

function icon(size) {
  const pixels = Buffer.alloc(size * size * 4); const scale = size / 256;
  const shapes = [
    [20, 18, 236, 238, 56, [29, 27, 32, 255]], [28, 26, 228, 228, 49, [48, 43, 58, 255]],
    [47, 52, 131, 136, 22, [208, 188, 255, 255]], [140, 52, 209, 136, 22, [103, 80, 164, 255]],
    [47, 145, 131, 209, 22, [181, 243, 239, 255]], [140, 145, 209, 209, 22, [253, 226, 147, 255]],
    [101, 101, 155, 155, 18, [29, 27, 32, 255]], [111, 111, 145, 145, 12, [255, 251, 254, 255]],
    [125, 92, 131, 164, 3, [255, 251, 254, 255]], [92, 125, 164, 131, 3, [255, 251, 254, 255]],
  ];
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const pixel = [0, 0, 0, 0]; const px = (x + .5) / scale; const py = (y + .5) / scale;
    for (const [left, top, right, bottom, radius, color] of shapes) rect(pixel, px, py, left, top, right, bottom, radius, color);
    const offset = (y * size + x) * 4; pixels[offset] = pixel[0]; pixels[offset + 1] = pixel[1]; pixels[offset + 2] = pixel[2]; pixels[offset + 3] = pixel[3];
  }
  return asPng(size, pixels);
}

const images = sizes.map((size) => ({ size, png: icon(size) }));
const header = Buffer.alloc(6 + images.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = header.length;
for (const [index, image] of images.entries()) {
  const entry = 6 + index * 16;
  header[entry] = image.size === 256 ? 0 : image.size; header[entry + 1] = image.size === 256 ? 0 : image.size;
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6); header.writeUInt32LE(image.png.length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += image.png.length;
}
await mkdir(dirname(output), { recursive: true }); await writeFile(output, Buffer.concat([header, ...images.map((image) => image.png)]));
console.log(`Wrote ${output} with ${images.length} icon sizes.`);
