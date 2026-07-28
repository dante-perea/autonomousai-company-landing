import { corsHeaders } from './cors.mjs';

export function operatorConfigResponse(environment, request) {
  const requestCorsHeaders = request ? corsHeaders(request) : {};

  if (!environment.POSTHOG_PROJECT_TOKEN || !environment.POSTHOG_HOST) {
    return Response.json(
      { error: 'Analytics is not configured.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          ...requestCorsHeaders,
        },
      },
    );
  }

  return Response.json(
    {
      posthogKey: environment.POSTHOG_PROJECT_TOKEN,
      posthogHost: environment.POSTHOG_HOST,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
        ...requestCorsHeaders,
      },
    },
  );
}
