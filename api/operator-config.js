import { operatorConfigResponse } from '../server/operator-config.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const result = operatorConfigResponse(process.env);
  response.status(result.status);
  result.headers.forEach((value, key) => response.setHeader(key, value));
  return response.send(await result.text());
}
