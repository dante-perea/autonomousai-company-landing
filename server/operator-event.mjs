import { corsHeaders, preflightResponse } from './cors.mjs';

const ALLOWED_EVENTS = new Set([
  'operator_page_view',
  'operator_cta_click',
  'operator_application_submitted',
]);
const ALLOWED_PROPERTIES = new Set([
  'application_id',
  'capture_source',
  'cta_id',
  'destination',
  'icp_fit',
  'offer',
  'price_usd',
  'referrer',
  'route',
  'utm_campaign',
  'utm_medium',
  'utm_source',
]);

function cleanText(value, maximum = 240) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function cleanProperties(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => ALLOWED_PROPERTIES.has(key))
      .map(([key, value]) => {
        if (typeof value === 'boolean') return [key, value];
        if (typeof value === 'number' && Number.isFinite(value)) return [key, value];
        return [key, cleanText(value)];
      })
      .filter(([, value]) => value !== ''),
  );
}

export async function recordOperatorEvent(input, context = {}, dependencies = {}) {
  const environment = context.environment || {};
  const fetchImpl = dependencies.fetchImpl || fetch;
  const now = dependencies.now || (() => new Date());
  const event = cleanText(input?.event, 80);
  const distinctId = cleanText(context.distinctId, 240);
  const sessionId = cleanText(context.sessionId, 240);

  if (!ALLOWED_EVENTS.has(event)) {
    return { ok: false, status: 400, error: 'Analytics event is invalid.' };
  }
  if (!distinctId) {
    return { ok: false, status: 400, error: 'Analytics identity is missing.' };
  }
  if (!environment.POSTHOG_PROJECT_TOKEN || !environment.POSTHOG_HOST) {
    throw new Error('Analytics is not configured.');
  }

  const response = await fetchImpl(
    `${environment.POSTHOG_HOST.replace(/\/$/, '')}/capture/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: environment.POSTHOG_PROJECT_TOKEN,
        event,
        properties: {
          ...cleanProperties(input.properties),
          distinct_id: distinctId,
          $session_id: sessionId || undefined,
          capture_source: 'operator_event_api',
        },
        timestamp: now().toISOString(),
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  const providerAccepted =
    response.ok &&
    (Number(body?.status) === 1 || body?.status === 'Ok');
  if (!providerAccepted) {
    throw new Error('Analytics provider rejected the event.');
  }

  return { ok: true, status: 202, recorded: true };
}

export async function operatorEventRequest(request, environment) {
  if (request.method === 'OPTIONS') return preflightResponse(request);

  const requestCorsHeaders = corsHeaders(request);
  if (!requestCorsHeaders['Access-Control-Allow-Origin']) {
    return Response.json({ error: 'Origin not allowed.' }, { status: 403 });
  }
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed.' },
      {
        status: 405,
        headers: { Allow: 'POST, OPTIONS', ...requestCorsHeaders },
      },
    );
  }
  if (Number(request.headers.get('content-length') || 0) > 8_000) {
    return Response.json(
      { error: 'Analytics payload is too large.' },
      { status: 413, headers: requestCorsHeaders },
    );
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { error: 'Analytics payload is invalid.' },
      { status: 400, headers: requestCorsHeaders },
    );
  }

  try {
    const result = await recordOperatorEvent(input, {
      environment,
      distinctId: request.headers.get('x-posthog-distinct-id'),
      sessionId: request.headers.get('x-posthog-session-id'),
    });
    return Response.json(result, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store', ...requestCorsHeaders },
    });
  } catch (error) {
    console.error('Analytics delivery failed', error);
    return Response.json(
      { error: 'Analytics could not be recorded.' },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store', ...requestCorsHeaders },
      },
    );
  }
}
