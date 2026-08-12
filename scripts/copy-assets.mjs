import { cp, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/renderer', import.meta.url), { recursive: true });
await mkdir(new URL('../dist/config', import.meta.url), { recursive: true });
await Promise.all([
  cp(new URL('../src/renderer/index.html', import.meta.url), new URL('../dist/renderer/index.html', import.meta.url)),
  cp(new URL('../src/renderer/styles.css', import.meta.url), new URL('../dist/renderer/styles.css', import.meta.url)),
  cp(new URL('../config/winutil.json', import.meta.url), new URL('../dist/config/winutil.json', import.meta.url)),
]);
