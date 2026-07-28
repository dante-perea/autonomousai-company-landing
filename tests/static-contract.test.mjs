import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('..', import.meta.url);
const publicDir = new URL('public/', root);

async function fileText(path) {
  return readFile(new URL(path, publicDir), 'utf8');
}

async function fileSize(path) {
  return (await stat(new URL(path, publicDir))).size;
}

async function pngDimensions(path) {
  const image = await readFile(new URL(path, publicDir));
  assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

test('ships Dante Perea’s founding thesis as the root page', async () => {
  const html = await fileText('index.html');

  assert.match(html, /From companies with fewer people/i);
  assert.match(html, /to one-person companies/i);
  assert.match(html, /zero standing employees/i);
  assert.match(html, /Software has been solved\./);
  assert.match(html, /applications/i);
  assert.match(html, /The next frontier is verification\./);
  assert.match(html, /zero-people contract research organizations/i);
  assert.match(html, /Zero people describes the direction, not the objective\./);
  assert.match(html, /which valuable loops can we close first\?/i);
  assert.match(html, /execution-validation loop/i);
});

test('keeps supporting claims connected to primary sources', async () => {
  const html = await fileText('index.html');

  assert.match(html, /youtube\.com\/watch\?v=Vv3CEAS_w34/);
  assert.match(html, /blog\.samaltman\.com\/the-gentle-singularity/);
  assert.match(html, /x\.com\/elonmusk\/status\/1893810875875889507/);
  assert.match(html, /nav\.al\/rich/);
  assert.match(html, /anthropic\.com\/news\/claude-science-ai-workbench/);
  assert.match(html, /periodic\.com/);
});

test('uses a semantic, local-first landing page without the handoff runtime', async () => {
  const html = await fileText('index.html');
  const css = await fileText('styles.css');
  const js = await fileText('site.js');

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>The Autonomous AI Company \| Founding Thesis<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css">/);
  assert.match(html, /<script src="\.\/site\.js" defer><\/script>/);
  assert.match(html, /<main id="main-content">/);
  assert.match(html, /<h1 id="hero-title">/);
  assert.doesNotMatch(html, /support\.js/);
  assert.doesNotMatch(html, /class Component extends DCLogic/);
  assert.doesNotMatch(html, /this field is live inference/i);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /oklch\(/);
  assert.match(js, /IntersectionObserver/);
});

test('keeps the brand assets and removes the obsolete handoff runtime', async () => {
  assert.ok((await fileSize('logo-mark.svg')) > 1000);
  assert.ok((await fileSize('wordmark-white.png')) > 10000);
  assert.deepEqual(await pngDimensions('og-card.png'), { width: 1200, height: 630 });
  await assert.rejects(fileSize('manifesto-singularity.dc.html'), /ENOENT/);
  await assert.rejects(fileSize('support.js'), /ENOENT/);
});
