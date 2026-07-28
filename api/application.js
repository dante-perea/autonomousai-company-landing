export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  response.setHeader(
    'Location',
    'https://operator.autonomousai.company/api/application',
  );
  response.setHeader('Cache-Control', 'no-store');
  return response.status(307).end();
}
