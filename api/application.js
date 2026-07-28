import { processApplication } from '../server/application-service.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const input =
      typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const result = await processApplication(input, {
      environment: process.env,
      source: request.headers.referer || '/galt',
      distinctId: request.headers['x-posthog-distinct-id'],
      sessionId: request.headers['x-posthog-session-id'],
    });

    response.setHeader('Cache-Control', 'no-store');
    return response.status(result.status || (result.ok ? 201 : 400)).json(result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return response.status(400).json({ error: 'Application payload is invalid.' });
    }
    console.error('Application delivery failed', error);
    return response
      .status(502)
      .json({ error: 'The application could not be delivered. Please try again.' });
  }
}
