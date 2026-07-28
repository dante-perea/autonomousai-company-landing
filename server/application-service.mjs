import { corsHeaders, preflightResponse } from './cors.mjs';

const MAX_TEXT_LENGTH = 1_600;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value, maximum = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maximum);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeApplication(input = {}) {
  return {
    name: cleanText(input.name, 120),
    email: cleanText(input.email, 180).toLowerCase(),
    company: cleanText(input.company, 160),
    companyWebsite: cleanText(input.companyWebsite, 240),
    teamSize: cleanText(input.teamSize, 40),
    annualRevenue: cleanText(input.annualRevenue, 40),
    opportunitiesPerMonth: cleanNumber(input.opportunitiesPerMonth),
    averageContractValue: cleanNumber(input.averageContractValue),
    monthlyWorkflowCost: cleanNumber(input.monthlyWorkflowCost),
    systems: cleanText(input.systems, 300),
    workflowProblem: cleanText(input.workflowProblem),
    startWindow: cleanText(input.startWindow, 60),
    consent: cleanText(input.consent, 10),
    faxNumber: cleanText(input.faxNumber, 120),
  };
}

export function validateApplication(application) {
  const errors = [];
  if (!application.name) errors.push('Your name is required.');
  if (!EMAIL_PATTERN.test(application.email)) errors.push('A valid work email is required.');
  if (!application.company) errors.push('Company is required.');
  if (!application.teamSize) errors.push('Team size is required.');
  if (!application.annualRevenue) errors.push('Annual revenue is required.');
  if (application.opportunitiesPerMonth < 0) errors.push('Opportunity volume is invalid.');
  if (application.averageContractValue < 0) errors.push('Average contract value is invalid.');
  if (application.monthlyWorkflowCost < 0) errors.push('Monthly workflow cost is invalid.');
  if (!application.systems) errors.push('Current systems are required.');
  if (!application.workflowProblem) errors.push('The current workflow problem is required.');
  if (!application.startWindow) errors.push('A start window is required.');
  if (application.consent !== 'yes') errors.push('Consent is required.');
  return errors;
}

export function assessIcpFit(application) {
  const reasons = [];
  const acceptedRevenue = new Set(['1m-3m', '3m-10m']);

  if (application.teamSize !== '5-25') reasons.push('team_size');
  if (!acceptedRevenue.has(application.annualRevenue)) reasons.push('annual_revenue');
  if (application.opportunitiesPerMonth < 10) reasons.push('opportunity_volume');
  if (application.averageContractValue < 15_000) reasons.push('contract_value');
  if (application.monthlyWorkflowCost < 4_000) reasons.push('workflow_cost');
  if (application.startWindow !== 'within-7-days') reasons.push('buying_window');

  return {
    matches: reasons.length === 0,
    reasons,
  };
}

function requireEnvironment(environment) {
  const required = [
    'AGENTMAIL_API_KEY',
    'AGENTMAIL_INBOX_ID',
    'APPLICATION_NOTIFICATION_EMAIL',
  ];
  const missing = required.filter((key) => !environment[key]);
  if (missing.length) {
    throw new Error(`Application notification is not configured: ${missing.join(', ')}`);
  }
}

function applicationText(application, applicationId, fit, metadata) {
  return [
    `Application: ${applicationId}`,
    `Received: ${metadata.receivedAt}`,
    `Source: ${metadata.source}`,
    `ICP fit: ${fit.matches ? 'YES' : 'MANUAL REVIEW'}`,
    `Fit exceptions: ${fit.reasons.join(', ') || 'none'}`,
    '',
    `Name: ${application.name}`,
    `Email: ${application.email}`,
    `Company: ${application.company}`,
    `Website: ${application.companyWebsite || 'not supplied'}`,
    `Team size: ${application.teamSize}`,
    `Annual revenue: ${application.annualRevenue}`,
    `Qualified opportunities per month: ${application.opportunitiesPerMonth}`,
    `Average contract value: $${application.averageContractValue.toLocaleString('en-US')}`,
    `Monthly senior-team workflow cost: $${application.monthlyWorkflowCost.toLocaleString('en-US')}`,
    `Systems: ${application.systems}`,
    `Start window: ${application.startWindow}`,
    '',
    'Current workflow problem:',
    application.workflowProblem,
  ].join('\n');
}

async function sendNotification(application, applicationId, fit, metadata, environment, fetchImpl) {
  const response = await fetchImpl(
    `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(environment.AGENTMAIL_INBOX_ID)}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${environment.AGENTMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: environment.APPLICATION_NOTIFICATION_EMAIL,
        reply_to: application.email,
        subject: `[GALT application] ${application.company} · ${fit.matches ? 'ICP fit' : 'manual review'}`,
        text: applicationText(application, applicationId, fit, metadata),
        labels: ['galt-application', fit.matches ? 'icp-fit' : 'manual-review'],
      }),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.message_id) {
    const detail = body?.message || body?.error || `HTTP ${response.status}`;
    throw new Error(`Application notification failed: ${detail}`);
  }

  return {
    messageId: body.message_id,
    threadId: body.thread_id,
  };
}

async function captureSubmission(application, applicationId, fit, metadata, environment, fetchImpl) {
  if (!environment.POSTHOG_PROJECT_TOKEN || !environment.POSTHOG_HOST) {
    return false;
  }

  const endpoint = `${environment.POSTHOG_HOST.replace(/\/$/, '')}/capture/`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: environment.POSTHOG_PROJECT_TOKEN,
      event: 'operator_application_submitted',
      properties: {
        distinct_id: metadata.distinctId || `application:${applicationId}`,
        $session_id: metadata.sessionId || undefined,
        route: '/galt',
        offer: 'lead_to_proposal_autonomy_sprint',
        price_usd: 5000,
        application_id: applicationId,
        icp_fit: fit.matches,
        fit_exceptions: fit.reasons,
        team_size: application.teamSize,
        annual_revenue: application.annualRevenue,
        opportunities_per_month: application.opportunitiesPerMonth,
        average_contract_value: application.averageContractValue,
        monthly_workflow_cost: application.monthlyWorkflowCost,
        start_window: application.startWindow,
        capture_source: 'application_api',
      },
      timestamp: metadata.receivedAt,
    }),
  });

  return response.ok;
}

export async function processApplication(input, context = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const now = dependencies.now || (() => new Date());
  const randomUUID = dependencies.randomUUID || (() => crypto.randomUUID());
  const environment = context.environment || {};
  const application = normalizeApplication(input);

  if (application.faxNumber) {
    return {
      ok: true,
      spam: true,
      applicationId: `galt_${now().getTime()}_filtered`,
      icpFit: false,
      analyticsRecorded: false,
    };
  }

  const errors = validateApplication(application);
  if (errors.length) {
    return {
      ok: false,
      status: 400,
      error: errors[0],
      errors,
    };
  }

  requireEnvironment(environment);
  const receivedAt = now().toISOString();
  const applicationId = `galt_${receivedAt.slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 8)}`;
  const fit = assessIcpFit(application);
  const metadata = {
    receivedAt,
    source: cleanText(context.source, 240) || '/galt',
    distinctId: cleanText(context.distinctId, 240),
    sessionId: cleanText(context.sessionId, 240),
  };

  const notification = await sendNotification(
    application,
    applicationId,
    fit,
    metadata,
    environment,
    fetchImpl,
  );

  const analyticsRecorded = await captureSubmission(
    application,
    applicationId,
    fit,
    metadata,
    environment,
    fetchImpl,
  ).catch(() => false);

  return {
    ok: true,
    status: 201,
    applicationId,
    icpFit: fit.matches,
    analyticsRecorded,
    notificationReceipt: notification.messageId,
  };
}

export async function applicationRequest(request, environment) {
  if (request.method === 'OPTIONS') {
    return preflightResponse(request);
  }

  if (request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed.' },
      {
        status: 405,
        headers: { Allow: 'POST, OPTIONS', ...corsHeaders(request) },
      },
    );
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 32_000) {
    return Response.json(
      { error: 'Application is too large.' },
      { status: 413, headers: corsHeaders(request) },
    );
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { error: 'Application payload is invalid.' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  try {
    const result = await processApplication(input, {
      environment,
      source: request.headers.get('referer') || '/galt',
      distinctId: request.headers.get('x-posthog-distinct-id'),
      sessionId: request.headers.get('x-posthog-session-id'),
    });

    return Response.json(result, {
      status: result.status || (result.ok ? 201 : 400),
      headers: {
        'Cache-Control': 'no-store',
        ...corsHeaders(request),
      },
    });
  } catch (error) {
    console.error('Application delivery failed', error);
    return Response.json(
      { error: 'The application could not be delivered. Please try again.' },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
          ...corsHeaders(request),
        },
      },
    );
  }
}
