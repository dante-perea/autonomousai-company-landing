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

function normalizedWords(markup) {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/[→↺·]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !/^\d+$/.test(word));
}

test('ships a concise six-beat landing derived from the founder thesis', async () => {
  const html = await fileText('index.html');
  const beats = [
    ...html.matchAll(
      /<section\b(?=[^>]*\sdata-beat(?:\s|>))[^>]*>[\s\S]*?<\/section>/gi,
    ),
  ].map((match) => match[0]);
  const beatNames = beats.map(
    (beat) => beat.match(/data-beat-name="([^"]+)"/i)?.[1] ?? '',
  );
  const beatWords = normalizedWords(beats.join(' '));

  assert.equal(beats.length, 6);
  assert.deepEqual(beatNames, [
    'intention',
    'execution',
    'verification',
    'frontiers',
    'scale',
    'judgement',
  ]);
  assert.ok(
    beatWords.length <= 270,
    `landing copy should stay punchy; found ${beatWords.length} words`,
  );

  assert.match(html, /Fewer people/i);
  assert.match(html, /one person/i);
  assert.match(html, /Zero standing[\s\S]*?employees\./i);
  assert.match(html, /Not because people lack value/i);
  assert.match(html, /Work has always been a proxy for value creation/i);
  assert.match(html, /href="\.\/thesis\/"/);
  assert.match(html, />Founding whitepaper<\/span>/);
  assert.match(html, />Read the founding whitepaper<\/span>/);
  assert.match(html, /The cost of turning[\s\S]*?intention into output[\s\S]*?is collapsing\./);
  assert.match(html, /Execution creates output\./);
  assert.match(html, /Verification turns[\s\S]*?it into value\./);
  assert.match(html, /Software has been solved\./);
  assert.match(html, /Verification is next\./);
  assert.match(html, /Company\.[\s\S]*?CRO\.[\s\S]*?Lab\./);
  assert.match(html, /Zero-people company/);
  assert.match(html, /Zero-people CRO/);
  assert.match(html, /Zero-people lab/);
  assert.match(html, /Everything delegated\./);
  assert.match(html, /Except judgement\./);
  assert.match(html, /remains accountable for irreversible decisions/i);
  assert.match(html, />Entropy<\/span>/);
  assert.match(html, />Atoms<\/span>/);
  assert.match(html, />DNA<\/span>/);
  assert.match(html, />Intelligence<\/span>/);
  assert.match(html, />AI<\/span>/);
  assert.match(html, />Human judgement<\/span>/);
  assert.doesNotMatch(html, /Sam Altman recently/i);
  assert.doesNotMatch(html, /Primary sources/i);
});

test('publishes the complete founder thesis as a dedicated whitepaper', async () => {
  const html = await fileText('thesis/index.html');

  assert.match(html, /A founding thesis on companies with zero standing employees/i);
  assert.match(html, /work has always been a proxy for value creation/i);
  assert.match(html, /cost of turning intention into valuable output is collapsing/i);
  assert.match(html, /two layers: applications and research/i);
  assert.match(html, /Software has been solved\./);
  assert.match(
    html,
    /A workflow represented and verified in software can increasingly move from AI-assisted, to automated, to autonomous/i,
  );
  assert.match(
    html,
    /Capital converts into scientific progress at the rate at which money buys iteration cycles/i,
  );
  assert.match(
    html,
    /The Autonomous AI Company is my exploration function for this future/i,
  );
  assert.match(html, /The AI Native Founder does not disappear/i);
  assert.match(html, /which valuable loops can we close first/i);
  assert.match(html, /youtube\.com\/watch\?v=Vv3CEAS_w34/);
  assert.match(html, /blog\.samaltman\.com\/the-gentle-singularity/);
  assert.match(html, /x\.com\/elonmusk\/status\/1893810875875889507/);
  assert.match(html, /nav\.al\/rich/);
  assert.match(html, /anthropic\.com\/news\/claude-science-ai-workbench/);
  assert.match(html, /periodic\.com/);
  assert.doesNotMatch(html, /site\.js/);
});

test('wires the landing to the Foundry architecture and semantic fallback', async () => {
  const html = await fileText('index.html');
  const thesis = await fileText('thesis/index.html');
  const baseCss = await fileText('styles.css');
  const foundryCss = await fileText('foundry.css');
  const director = await fileText('site.js');
  const world = await fileText('foundry-world.js');
  const evolution = await fileText('evolution-system.js');
  const story = await fileText('foundry-story.js');

  assert.match(html, /<html[\s\S]*?lang="en"[^>]*>/);
  assert.match(html, /<title>The Autonomous AI Company<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css">/);
  assert.match(html, /<link rel="stylesheet" href="\.\/foundry\.css">/);
  assert.match(html, /<script src="\.\/site\.js" type="module"><\/script>/);
  assert.match(html, /<main id="main-content">/);
  assert.match(html, /<canvas id="foundry-canvas" aria-hidden="true"><\/canvas>/);
  assert.match(html, /data-foundry-track/);
  assert.match(html, /data-foundry-stage/);
  assert.equal((html.match(/<canvas\b/g) ?? []).length, 1);
  assert.equal((html.match(/\sdata-beat(?:\s|>)/g) ?? []).length, 6);

  assert.doesNotMatch(html, /id="gpu-field"/);
  assert.doesNotMatch(html, /optical-stage/);
  assert.doesNotMatch(html, /data-optical-surface/);
  assert.doesNotMatch(html, /data-motion-group/);
  assert.doesNotMatch(html, /gpu-background\.js/);
  assert.doesNotMatch(html, /cinematic\.css/);
  assert.doesNotMatch(html, /id="agent-swarm"/);
  assert.doesNotMatch(html, /support\.js/);
  assert.doesNotMatch(html, /__TAIC_CINEMATIC__/);

  assert.match(
    html,
    /class="foundry-lockup"[\s\S]*?<span>The Autonomous AI Company<\/span>/,
  );
  assert.match(
    thesis,
    /class="brand__name">The Autonomous AI Company<\/span>/,
  );
  assert.doesNotMatch(thesis, /site\.js/);

  assert.match(baseCss, /:focus-visible/);
  assert.match(foundryCss, /prefers-reduced-motion/);
  assert.match(foundryCss, /foundry-fallback/);
  assert.match(foundryCss, /data-foundry-ready/);

  assert.match(director, /ScrollTrigger/);
  assert.match(director, /createFoundryWorld/);
  assert.match(director, /STORY_BEATS/);
  assert.match(director, /window\.__TAIC_FOUNDRY__/);
  assert.match(director, /getSnapshot:\s*snapshot/);
  assert.match(director, /seek/);
  assert.match(director, /pagehide/);
  assert.match(director, /pageshow/);
  assert.match(director, /prefers-reduced-motion/);
  assert.match(director, /foundry-fallback/);

  assert.match(world, /new THREE\.WebGLRenderer/);
  assert.match(world, /new THREE\.PerspectiveCamera/);
  assert.match(world, /new THREE\.CatmullRomCurve3/);
  assert.match(world, /createEvolutionSystem/);
  assert.match(world, /webglcontextlost/);
  assert.match(world, /webglcontextrestored/);
  assert.match(world, /visibilitychange/);
  assert.match(world, /rendererCount:\s*1/);
  assert.match(world, /renderState:\s*'fallback'/);

  assert.match(story, /entropy/);
  assert.match(story, /atoms/);
  assert.match(story, /dna/);
  assert.match(story, /intelligence/);
  assert.match(story, /autonomous-company/);
  assert.match(story, /founder-boundary/);
  assert.match(evolution, /probability/i);
  assert.match(evolution, /calibration/i);
  assert.match(evolution, /proof/i);
  assert.match(evolution, /founder-boundary/i);
  assert.doesNotMatch(evolution, /execution-machinery-corridor/);
  assert.doesNotMatch(evolution, /physical-validation-scanner/);
  assert.doesNotMatch(evolution, /company-cro-lab-nested-reveal/);
});

test('keeps the brand and social assets intact', async () => {
  assert.ok((await fileSize('logo-mark.svg')) > 1_000);
  assert.ok((await fileSize('wordmark-white.png')) > 10_000);
  assert.ok((await fileSize('foundry.css')) > 10_000);
  assert.ok((await fileSize('foundry-world.js')) > 20_000);
  assert.ok((await fileSize('evolution-system.js')) > 20_000);
  assert.deepEqual(await pngDimensions('og-card.png'), {
    width: 1200,
    height: 630,
  });
  await assert.rejects(fileSize('manifesto-singularity.dc.html'), /ENOENT/);
  await assert.rejects(fileSize('support.js'), /ENOENT/);
});
