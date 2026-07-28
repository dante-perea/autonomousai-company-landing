import posthog from 'posthog-js/dist/module.no-external';

const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';
const configuredApiOrigin =
  document.querySelector('meta[name="taic-operator-api-origin"]')?.content.trim() ||
  '';
const apiOrigin = configuredApiOrigin
  ? new URL(configuredApiOrigin, window.location.origin).origin
  : '';
const apiUrl = (path) => `${apiOrigin}${path}`;

let analyticsReady = false;
const analyticsInitialization = isLocal
  ? Promise.resolve(false)
  : fetch(apiUrl('/api/operator-config'), {
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((configuration) => {
        if (!configuration?.posthogKey || !configuration?.posthogHost) {
          return false;
        }

        posthog.init(configuration.posthogKey, {
          api_host: configuration.posthogHost,
          defaults: '2026-05-30',
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          person_profiles: 'identified_only',
        });
        analyticsReady = true;
        return true;
      })
      .catch(() => false);

function campaignProperties() {
  const parameters = new URLSearchParams(window.location.search);
  return {
    route: '/galt',
    offer: 'lead_to_proposal_autonomy_sprint',
    price_usd: 5000,
    utm_source: parameters.get('utm_source') || undefined,
    utm_medium: parameters.get('utm_medium') || undefined,
    utm_campaign: parameters.get('utm_campaign') || undefined,
  };
}

function capture(event, properties = {}) {
  const testCapture = window.__TAIC_OPERATOR_TEST_CAPTURE__;
  if (typeof testCapture === 'function') {
    testCapture(event, { ...campaignProperties(), ...properties });
  }

  analyticsInitialization.then((ready) => {
    if (ready) {
      posthog.capture(event, { ...campaignProperties(), ...properties });
    }
  });
}

function captureException(error, properties = {}) {
  analyticsInitialization.then((ready) => {
    if (ready) {
      posthog.captureException(error, {
        ...campaignProperties(),
        ...properties,
      });
    }
  });
}

capture('operator_page_view', {
  referrer: document.referrer || undefined,
});

document.querySelectorAll('[data-cta]').forEach((link) => {
  link.addEventListener('click', () => {
    capture('operator_cta_click', {
      cta_id: link.dataset.cta,
      destination: link.getAttribute('href'),
    });
  });
});

const proofOrder = ['input', 'output', 'draft', 'approval', 'receipts'];
const proofStatus = {
  input: 'Input received',
  output: 'Evidence verified',
  draft: 'Review draft assembled',
  approval: 'External action blocked',
  receipts: 'Receipts available',
};
const nextLabels = {
  input: 'Next: verified output',
  output: 'Next: proposal draft',
  draft: 'Next: approval gate',
  approval: 'Next: run receipts',
  receipts: 'Restart proof',
};

const proofTabs = [...document.querySelectorAll('[data-proof-tab]')];
const proofPanels = [...document.querySelectorAll('[data-proof-panel]')];
const proofStatusNode = document.querySelector('[data-proof-status]');
const proofNext = document.querySelector('[data-proof-next]');

function selectProofStep(step, { focus = false } = {}) {
  if (!proofOrder.includes(step)) return;

  document.documentElement.dataset.proofStep = step;
  proofTabs.forEach((tab) => {
    const active = tab.dataset.proofTab === step;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  proofPanels.forEach((panel) => {
    panel.hidden = panel.dataset.proofPanel !== step;
  });

  if (proofStatusNode) proofStatusNode.textContent = proofStatus[step];
  if (proofNext) {
    proofNext.firstChild.textContent = `${nextLabels[step]} `;
  }
}

proofTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    selectProofStep(tab.dataset.proofTab);
  });

  tab.addEventListener('keydown', (event) => {
    const currentIndex = proofOrder.indexOf(tab.dataset.proofTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % proofOrder.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + proofOrder.length) % proofOrder.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = proofOrder.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    selectProofStep(proofOrder[nextIndex], { focus: true });
  });
});

proofNext?.addEventListener('click', () => {
  const current = document.documentElement.dataset.proofStep || 'input';
  const currentIndex = proofOrder.indexOf(current);
  selectProofStep(proofOrder[(currentIndex + 1) % proofOrder.length]);
});

const approvalGate = document.querySelector('[data-approval-gate]');
const approvalButton = document.querySelector('[data-approve-proof]');
const approvalState = document.querySelector('[data-approval-state]');
const approvalNote = document.querySelector('[data-approval-note]');
const approvalReceipt = document.querySelector('[data-receipt-approval]');

approvalButton?.addEventListener('click', () => {
  const approved = approvalGate?.dataset.approved === 'true';

  if (approved) {
    delete approvalGate.dataset.approved;
    approvalState.textContent = 'Blocked pending founder review';
    approvalButton.firstChild.textContent = 'Approve this sample ';
    approvalNote.textContent =
      'No email has been sent. Approval changes the authorization record only.';
    approvalReceipt.textContent = 'WAITING_APPROVAL';
    return;
  }

  approvalGate.dataset.approved = 'true';
  approvalState.textContent = 'Approved by founder';
  approvalButton.firstChild.textContent = 'Reset sample approval ';
  approvalNote.textContent =
    'Approval receipt recorded. The representative proof still does not execute an external send.';
  approvalReceipt.textContent = 'FOUNDER_APPROVED';
});

const form = document.querySelector('[data-application-form]');
const formStatus = document.querySelector('[data-form-status]');
const submitButton = form?.querySelector('button[type="submit"]');
const submitLabel = form?.querySelector('[data-submit-label]');

function showFormStatus(message, state) {
  formStatus.hidden = false;
  formStatus.dataset.state = state;
  formStatus.innerHTML = '';
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  paragraph.style.margin = '0';
  formStatus.append(paragraph);
  formStatus.focus?.();
}

function applicationPayload(formData) {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  );
}

function analyticsHeaders() {
  if (!analyticsReady) return {};

  const headers = {
    'X-PostHog-Distinct-ID': posthog.get_distinct_id(),
  };
  const sessionId = posthog.get_session_id?.();
  if (sessionId) headers['X-PostHog-Session-ID'] = sessionId;
  return headers;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.hidden = true;

  const invalidField = [...form.elements].find(
    (element) => element instanceof HTMLElement && 'checkValidity' in element && !element.checkValidity(),
  );

  if (invalidField) {
    invalidField.setAttribute('aria-invalid', 'true');
    invalidField.reportValidity();
    invalidField.focus();
    return;
  }

  form.querySelectorAll('[aria-invalid="true"]').forEach((element) => {
    element.removeAttribute('aria-invalid');
  });

  submitButton.disabled = true;
  submitLabel.textContent = 'Submitting…';

  try {
    const response = await fetch(apiUrl('/api/application'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...analyticsHeaders(),
      },
      body: JSON.stringify(applicationPayload(new FormData(form))),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'The application could not be delivered.');
    }

    if (!result.analyticsRecorded) {
      capture('operator_application_submitted', {
        application_id: result.applicationId,
        icp_fit: result.icpFit,
        capture_source: 'browser_fallback',
      });
    }

    form.reset();
    showFormStatus(
      `Application ${result.applicationId} was delivered. Expect a response within two business days.`,
      'success',
    );
    submitLabel.textContent = 'Application delivered';
  } catch (error) {
    captureException(error, { boundary: 'operator_application_form' });
    showFormStatus(
      `${error.message} Please email galt@autonomousai.company if the problem continues.`,
      'error',
    );
    submitLabel.textContent = 'Submit application';
  } finally {
    submitButton.disabled = false;
  }
});

selectProofStep('input');
