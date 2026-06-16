import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url);
const publicDir = new URL('public/', root);

async function fileText(path) {
  return readFile(new URL(path, publicDir), 'utf8');
}

async function fileSize(path) {
  return (await stat(new URL(path, publicDir))).size;
}

test('ships the design handoff as the root static page', async () => {
  const html = await fileText('index.html');

  assert.match(html, /<script src="\.\/support\.js"><\/script>/);
  assert.match(html, /<canvas ref="\{\{ glRef \}\}"/);
  assert.match(html, /<canvas ref="\{\{ swarmRef \}\}"/);
  assert.match(html, /Software has<br>been/);
  assert.match(html, /The singularity is here/);
  assert.match(html, /The agentic web is live\./);
  assert.match(html, /Intelligence is now/);
  assert.match(html, /Signal received\. Welcome to the singularity\./);
  assert.match(html, /class Component extends DCLogic/);
});

test('keeps all handoff runtime and brand assets local', async () => {
  const html = await fileText('index.html');
  const support = await fileText('support.js');

  assert.match(html, /src="logo-mark\.svg"/);
  assert.match(html, /src="wordmark-white\.png"/);
  assert.match(support, /react@18\.3\.1\/umd\/react\.production\.min\.js/);
  assert.match(support, /react-dom@18\.3\.1\/umd\/react-dom\.production\.min\.js/);
  assert.ok((await fileSize('logo-mark.svg')) > 1000);
  assert.ok((await fileSize('wordmark-white.png')) > 10000);
});

test('keeps the original handoff available for traceability', async () => {
  const original = await fileText('manifesto-singularity.dc.html');
  const rootPage = await fileText('index.html');

  assert.equal(rootPage, original);
});
