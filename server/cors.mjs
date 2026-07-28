const PUBLIC_ORIGINS = new Set([
  'https://autonomousai.company',
  'https://www.autonomousai.company',
]);

export function corsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!origin) return {};

  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin && !PUBLIC_ORIGINS.has(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'Content-Type, X-PostHog-Distinct-ID, X-PostHog-Session-ID',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function preflightResponse(request) {
  const headers = corsHeaders(request);
  if (!headers['Access-Control-Allow-Origin']) {
    return Response.json({ error: 'Origin not allowed.' }, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      'Access-Control-Max-Age': '86400',
    },
  });
}
