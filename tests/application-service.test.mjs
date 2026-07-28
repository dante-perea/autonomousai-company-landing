import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applicationRequest,
  assessIcpFit,
  normalizeApplication,
  processApplication,
  validateApplication,
} from '../server/application-service.mjs';
import { operatorConfigResponse } from '../server/operator-config.mjs';
import {
  operatorEventRequest,
  recordOperatorEvent,
} from '../server/operator-event.mjs';

const validInput = {
  name: 'Ada Founder',
  email: 'ada@example.com',
  company: 'Exact Agency',
  companyWebsite: 'https://example.com',
  teamSize: '5-25',
  annualRevenue: '3m-10m',
  opportunitiesPerMonth: '14',
  averageContractValue: '28000',
  monthlyWorkflowCost: '6500',
  systems: 'Gmail, HubSpot, Google Docs',
  workflowProblem: 'Research and proposal assembly take eight senior hours.',
  startWindow: 'within-7-days',
  consent: 'yes',
  faxNumber: '',
};

const environment = {
  AGENTMAIL_API_KEY: 'test-agentmail-key',
  AGENTMAIL_INBOX_ID: 'test-inbox',
  APPLICATION_NOTIFICATION_EMAIL: 'founder@example.com',
  POSTHOG_PROJECT_TOKEN: 'test-posthog-token',
  POSTHOG_HOST: 'https://us.i.posthog.com',
};
const allowRateLimit = async () => ({
  allowed: true,
  attempts: 1,
  retryAfterSeconds: 900,
});

test('normalizes values and applies the published ICP thresholds', () => {
  const application = normalizeApplication(validInput);
  assert.equal(application.opportunitiesPerMonth, 14);
  assert.equal(application.averageContractValue, 28_000);
  assert.equal(application.monthlyWorkflowCost, 6_500);
  assert.deepEqual(validateApplication(application), []);
  assert.deepEqual(assessIcpFit(application), { matches: true, reasons: [] });

  assert.deepEqual(
    assessIcpFit({
      ...application,
      opportunitiesPerMonth: 9,
      averageContractValue: 14_999,
      monthlyWorkflowCost: 3_999,
    }),
    {
      matches: false,
      reasons: ['opportunity_volume', 'contract_value', 'workflow_cost'],
    },
  );
});

test('delivers the application notification before recording conversion', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (String(url).includes('agentmail.to')) {
      return new Response(
        JSON.stringify({ message_id: 'msg_receipt_123', thread_id: 'thread_123' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ status: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await processApplication(
    validInput,
    {
      environment,
      source: 'https://autonomousai.company/galt?utm_source=linkedin',
      distinctId: 'anonymous-test-id',
      sessionId: 'session-test-id',
    },
    {
      fetchImpl,
      rateLimiter: allowRateLimit,
      now: () => new Date('2026-07-28T09:00:00.000Z'),
      randomUUID: () => '12345678-abcd-4000-8000-123456789abc',
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.applicationId, 'galt_20260728_12345678');
  assert.equal(result.icpFit, true);
  assert.equal(result.analyticsRecorded, true);
  assert.equal(result.notificationReceipt, 'msg_receipt_123');
  assert.equal(calls.length, 2);

  const notification = calls[0];
  assert.match(notification.url, /agentmail\.to/);
  assert.equal(notification.body.to, 'founder@example.com');
  assert.equal(notification.body.reply_to, 'ada@example.com');
  assert.match(notification.body.subject, /Exact Agency · ICP fit/);
  assert.match(notification.body.text, /Application: galt_20260728_12345678/);

  const analytics = calls[1];
  assert.equal(analytics.body.event, 'operator_application_submitted');
  assert.equal(analytics.body.properties.distinct_id, 'anonymous-test-id');
  assert.equal(analytics.body.properties.icp_fit, true);
  assert.equal(analytics.body.properties.average_contract_value, 28_000);
});

test('does not report success when founder notification fails', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ message: 'delivery rejected' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });

  await assert.rejects(
    processApplication(
      validInput,
      { environment },
      {
        fetchImpl,
        rateLimiter: allowRateLimit,
        now: () => new Date('2026-07-28T09:00:00.000Z'),
        randomUUID: () => '12345678-abcd-4000-8000-123456789abc',
      },
    ),
    /Application notification failed: delivery rejected/,
  );
});

test('rejects incomplete submissions before calling external services', async () => {
  let calls = 0;
  const result = await processApplication(
    { ...validInput, email: 'not-an-email' },
    { environment },
    {
      fetchImpl: async () => {
        calls += 1;
        return new Response();
      },
      rateLimiter: allowRateLimit,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /valid work email/i);
  assert.equal(calls, 0);
});

test('silently filters honeypot submissions without external calls', async () => {
  let calls = 0;
  const result = await processApplication(
    { ...validInput, faxNumber: 'spam' },
    { environment },
    {
      fetchImpl: async () => {
        calls += 1;
        return new Response();
      },
      now: () => new Date('2026-07-28T09:00:00.000Z'),
      rateLimiter: allowRateLimit,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.spam, true);
  assert.equal(calls, 0);
});

test('rejects invalid direct-API economics before external calls', async () => {
  const invalidValues = [
    0,
    '',
    'not-a-number',
    true,
    '0x10',
    '1e4',
    15_000.5,
  ];

  for (const value of invalidValues) {
    let calls = 0;
    const result = await processApplication(
      { ...validInput, averageContractValue: value },
      { environment },
      {
        fetchImpl: async () => {
          calls += 1;
          return new Response();
        },
        rateLimiter: allowRateLimit,
      },
    );

    assert.equal(result.status, 400);
    assert.match(result.error, /average contract value is invalid/i);
    assert.equal(calls, 0);
  }
});

test('returns a retryable 429 before notification when the address is throttled', async () => {
  let calls = 0;
  const result = await processApplication(
    validInput,
    { environment, clientAddress: '203.0.113.7' },
    {
      fetchImpl: async () => {
        calls += 1;
        return new Response();
      },
      rateLimiter: async () => ({
        allowed: false,
        attempts: 4,
        retryAfterSeconds: 321,
      }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.equal(result.retryAfterSeconds, 321);
  assert.equal(calls, 0);
});

test('allows the canonical site to call the hosted application API', async () => {
  const request = new Request('https://operator.example/api/application', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://autonomousai.company',
      'Access-Control-Request-Method': 'POST',
    },
  });

  const response = await applicationRequest(request, environment);
  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://autonomousai.company',
  );
  assert.match(
    response.headers.get('access-control-allow-headers'),
    /X-PostHog-Distinct-ID/,
  );
});

test('serves only the public PostHog configuration with canonical CORS', async () => {
  const request = new Request('https://operator.example/api/operator-config', {
    headers: { Origin: 'https://autonomousai.company' },
  });
  const response = operatorConfigResponse(environment, request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://autonomousai.company',
  );
  assert.equal(body.posthogKey, 'test-posthog-token');
  assert.equal(body.posthogHost, 'https://us.i.posthog.com');
  assert.equal(body.AGENTMAIL_API_KEY, undefined);
});

test('records only allowlisted first-party funnel events with provider acknowledgment', async () => {
  let captured;
  const result = await recordOperatorEvent(
    {
      event: 'operator_cta_click',
      properties: {
        route: '/galt',
        cta_id: 'hero',
        destination: '#apply',
        ignored: 'not-forwarded',
      },
    },
    {
      environment,
      distinctId: 'operator-test',
      sessionId: 'session-test',
    },
    {
      fetchImpl: async (url, options) => {
        captured = { url, body: JSON.parse(options.body) };
        return Response.json({ status: 'Ok' });
      },
      now: () => new Date('2026-07-28T09:00:00.000Z'),
    },
  );

  assert.deepEqual(result, { ok: true, status: 202, recorded: true });
  assert.equal(captured.body.event, 'operator_cta_click');
  assert.equal(captured.body.properties.distinct_id, 'operator-test');
  assert.equal(captured.body.properties.$session_id, 'session-test');
  assert.equal(captured.body.properties.ignored, undefined);
});

test('rejects unknown first-party events before calling the provider', async () => {
  let calls = 0;
  const result = await recordOperatorEvent(
    { event: 'arbitrary_event' },
    { environment, distinctId: 'operator-test' },
    {
      fetchImpl: async () => {
        calls += 1;
        return Response.json({ status: 1 });
      },
    },
  );

  assert.equal(result.status, 400);
  assert.equal(calls, 0);
});

test('requires an allowed browser origin for the first-party event endpoint', async () => {
  const request = new Request('https://operator.example/api/operator-event', {
    method: 'POST',
    headers: {
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
      'X-PostHog-Distinct-ID': 'operator-test',
    },
    body: JSON.stringify({ event: 'operator_page_view' }),
  });
  const response = await operatorEventRequest(request, environment);
  assert.equal(response.status, 403);
});
