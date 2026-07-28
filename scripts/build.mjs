import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { build } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = resolve(root, 'public');
const output = resolve(root, 'dist');
const clientOutput = resolve(output, 'client');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

async function buildSite(outDir) {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      emptyOutDir: false,
      outDir,
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
}

async function buildOperator(outDir) {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      emptyOutDir: false,
      outDir,
      minify: 'esbuild',
      lib: {
        entry: resolve(source, 'galt/operator.js'),
        formats: ['es'],
        fileName: () => 'galt/operator.js',
      },
    },
  });
}

await buildSite(output);
await buildOperator(output);

await mkdir(resolve(output, 'server'), { recursive: true });
await bundle({
  entryPoints: [resolve(root, 'worker/index.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: resolve(output, 'server/index.js'),
});

await mkdir(clientOutput, { recursive: true });
await cp(source, clientOutput, { recursive: true });
await buildSite(clientOutput);
await buildOperator(clientOutput);
