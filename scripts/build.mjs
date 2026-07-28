import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = resolve(root, 'public');
const output = resolve(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  build: {
    emptyOutDir: false,
    outDir: output,
    minify: 'esbuild',
    lib: {
      entry: resolve(source, 'site.js'),
      formats: ['es'],
      fileName: () => 'site.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'site.js',
      },
    },
  },
});
