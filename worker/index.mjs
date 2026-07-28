import { applicationRequest } from '../server/application-service.mjs';
import { preflightResponse } from '../server/cors.mjs';
import { operatorConfigResponse } from '../server/operator-config.mjs';

const worker = {
  async fetch(request, environment) {
    const url = new URL(request.url);

    if (url.pathname === '/api/application') {
      return applicationRequest(request, environment);
    }

    if (url.pathname === '/api/operator-config') {
      if (request.method === 'OPTIONS') {
        return preflightResponse(request);
      }
      if (request.method !== 'GET') {
        return Response.json(
          { error: 'Method not allowed.' },
          { status: 405, headers: { Allow: 'GET' } },
        );
      }
      return operatorConfigResponse(environment, request);
    }

    if (url.pathname === '/operator' || url.pathname === '/operator/') {
      url.pathname = '/galt/';
      return Response.redirect(url, 308);
    }

    if (url.pathname === '/galt') {
      url.pathname = '/galt/';
      return Response.redirect(url, 308);
    }

    return environment.ASSETS.fetch(request);
  },
};

export default worker;
