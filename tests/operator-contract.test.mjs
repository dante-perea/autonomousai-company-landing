import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('..', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('publishes one fixed commercial offer at /galt', async () => {
  const html = await text('public/galt/index.html');

  assert.match(html, /TAIC Lead-to-Proposal Autonomy Sprint/);
  assert.match(html, /Qualified lead in\.[\s\S]*Review-ready proposal out\./);
  assert.match(html, /\$5,000/);
  assert.match(html, /\$2,500, non-refundable/);
  assert.match(html, /10 business days/);
  assert.match(html, /Two design-partner slots/);
  assert.match(html, /Nothing is sent externally without explicit human approval/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /data-application-form/);
  assert.match(html, /data-cta="hero"/);
});

test('states the exact ICP, exclusions and acceptance contract', async () => {
  const html = await text('public/galt/index.html');

  assert.match(html, /5–25-person B2B agency or consultancy/);
  assert.match(html, /\$1M–\$10M annually/);
  assert.match(html, /at least 10 qualified opportunities each month/);
  assert.match(html, /above \$15,000 on average/);
  assert.match(html, /at least \$4,000 per month/);
  assert.match(html, /Pre-revenue companies/);
  assert.match(html, /Regulated healthcare/);
  assert.match(html, /9 of 10/);
  assert.match(html, /8 of 10/);
  assert.match(html, /≥60%/);
  assert.match(html, /≤\$5/);
  assert.match(html, /Zero[\s\S]*unauthorized external actions/);
  assert.match(html, /No custom UI; separately scoped if required/);
});

test('requires durable throttling before applications can trigger notifications', async () => {
  const hosting = JSON.parse(await text('.openai/hosting.json'));
  const server = await text('server/application-service.mjs');
  const limiter = await text('server/rate-limit.mjs');
  const migration = await text('drizzle/0000_application_rate_limits.sql');

  assert.equal(hosting.d1, 'DB');
  assert.match(server, /enforceApplicationRateLimit/);
  assert.match(limiter, /MAX_ATTEMPTS = 3/);
  assert.match(limiter, /15 \* 60 \* 1_000/);
  assert.match(limiter, /SHA-256/);
  assert.match(migration, /application_rate_limits/);
});

test('ships a five-minute proof with input, output, gate and receipts', async () => {
  const html = await text('public/galt/index.html');

  assert.match(html, /Five-minute proof/);
  assert.match(html, /This is a deterministic replay/);
  assert.match(html, /data-proof-panel="input"/);
  assert.match(html, /data-proof-panel="output"/);
  assert.match(html, /data-proof-panel="draft"/);
  assert.match(html, /data-proof-panel="approval"/);
  assert.match(html, /data-proof-panel="receipts"/);
  assert.match(html, /Blocked pending founder review/);
  assert.match(html, /NOT_EXECUTED/);
  assert.match(html, /No email has been sent/);
});

test('defines the three requested funnel events and a server-confirmed conversion', async () => {
  const browser = await text('public/galt/operator.js');
  const server = await text('server/application-service.mjs');

  assert.match(browser, /capture\('operator_page_view'/);
  assert.match(browser, /capture\('operator_cta_click'/);
  assert.match(browser, /capture\('operator_application_submitted'/);
  assert.match(browser, /X-PostHog-Distinct-ID/);
  assert.match(server, /event: 'operator_application_submitted'/);
  assert.match(server, /capture_source: 'application_api'/);
  assert.match(server, /notificationReceipt/);
});

test('uses the operator subdomain as canonical and redirects both entry paths', async () => {
  const html = await text('public/galt/index.html');
  const vercel = JSON.parse(await text('vercel.json'));
  const worker = await text('worker/index.mjs');

  assert.match(
    html,
    /rel="canonical" href="https:\/\/operator\.autonomousai\.company\/galt\/"/,
  );
  assert.deepEqual(vercel.redirects, [
    {
      source: '/galt',
      destination: 'https://operator.autonomousai.company/galt/',
      permanent: false,
    },
    {
      source: '/operator',
      destination: 'https://operator.autonomousai.company/galt/',
      permanent: false,
    },
  ]);
  assert.match(worker, /url\.hostname === 'operator\.autonomousai\.company'/);
  assert.match(worker, /url\.pathname === '\/operator'/);
  assert.match(worker, /url\.pathname === '\/galt'/);
});

test('keeps the durable operator service as the only application write backend', async () => {
  const adapter = await text('api/application.js');

  assert.match(
    adapter,
    /https:\/\/operator\.autonomousai\.company\/api\/application/,
  );
  assert.match(adapter, /status\(307\)/);
  assert.doesNotMatch(adapter, /processApplication/);
});
