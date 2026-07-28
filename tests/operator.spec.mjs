import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function installAnalyticsProbe(page) {
  await page.addInitScript(() => {
    window.__operatorEvents = [];
    window.__TAIC_OPERATOR_TEST_CAPTURE__ = (event, properties) => {
      window.__operatorEvents.push({ event, properties });
    };
  });
}

async function fillQualifiedApplication(page) {
  await page.getByLabel('Your name').fill('Ada Founder');
  await page.getByLabel('Work email').fill('ada@example.com');
  await page.getByLabel('Company', { exact: true }).fill('Exact Agency');
  await page.getByLabel('Company website').fill('https://example.com');
  await page.getByLabel('Team size').selectOption('5-25');
  await page.getByLabel('Annual revenue').selectOption('3m-10m');
  await page.getByLabel('Qualified opportunities / month').fill('14');
  await page.getByLabel('Average contract value, USD').fill('28000');
  await page.getByLabel('Monthly senior-team cost, USD').fill('6500');
  await page
    .getByLabel('Current systems')
    .fill('Gmail, HubSpot, Google Docs');
  await page
    .getByLabel('Where does the workflow currently break?')
    .fill('Research and proposal assembly take eight senior hours.');
  await page.getByLabel('When could you start?').selectOption('within-7-days');
  await page
    .getByLabel(
      'I understand this application concerns one fixed-scope workflow and does not authorize external actions.',
    )
    .check();
}

test.beforeEach(async ({ page }) => {
  await installAnalyticsProbe(page);
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
});

test('presents the complete offer and tracks the top of the funnel', async ({ page }) => {
  await page.goto('/galt/', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/Lead-to-Proposal Autonomy Sprint/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Qualified lead in\. Review-ready proposal out\./i,
    }),
  ).toBeVisible();
  await expect(page.getByText('$5,000', { exact: true })).toBeVisible();
  await expect(page.getByText('Two design-partner slots at this price.')).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__operatorEvents.some(
          (item) => item.event === 'operator_page_view',
        ),
      ),
    )
    .toBe(true);

  await page.getByRole('link', { name: 'Apply for the sprint' }).click();
  await expect(page.locator('#apply')).toBeInViewport();

  const events = await page.evaluate(() => window.__operatorEvents);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'operator_cta_click',
        properties: expect.objectContaining({
          cta_id: 'hero',
          offer: 'lead_to_proposal_autonomy_sprint',
          price_usd: 5000,
        }),
      }),
    ]),
  );
});

test('walks through input, output, approval and receipts', async ({ page }) => {
  await page.goto('/galt/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('tabpanel', { name: /Input/ })).toBeVisible();
  await page.getByRole('tab', { name: /Output/ }).click();
  await expect(page.getByText('Budget exceeds $40k')).toBeVisible();

  await page.getByRole('tab', { name: /Approval/ }).click();
  await expect(page.getByText('Blocked pending founder review')).toBeVisible();
  await page.getByRole('button', { name: /Approve this sample/ }).click();
  await expect(page.getByText('Approved by founder')).toBeVisible();

  await page.getByRole('tab', { name: /Receipts/ }).click();
  await expect(page.getByText('FOUNDER_APPROVED')).toBeVisible();
  await expect(page.getByText('NOT_EXECUTED')).toBeVisible();
});

test('submits a qualified application and uses the server receipt', async ({ page }) => {
  let submittedPayload;
  await page.route('**/api/application', async (route) => {
    submittedPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        applicationId: 'galt_20260728_browser',
        icpFit: true,
        analyticsRecorded: true,
        notificationReceipt: 'msg_browser_receipt',
      }),
    });
  });

  await page.goto('/galt/', { waitUntil: 'domcontentloaded' });
  await fillQualifiedApplication(page);
  await page.getByRole('button', { name: 'Submit application' }).click();

  await expect(page.getByRole('status')).toContainText(
    /Application galt_20260728_browser was delivered/,
  );
  expect(submittedPayload).toEqual(
    expect.objectContaining({
      name: 'Ada Founder',
      company: 'Exact Agency',
      teamSize: '5-25',
      annualRevenue: '3m-10m',
      opportunitiesPerMonth: '14',
      averageContractValue: '28000',
      monthlyWorkflowCost: '6500',
      consent: 'yes',
    }),
  );

  const events = await page.evaluate(() => window.__operatorEvents);
  expect(
    events.filter((item) => item.event === 'operator_application_submitted'),
  ).toHaveLength(0);
});

test('uses browser analytics fallback only when server capture fails', async ({ page }) => {
  await page.route('**/api/application', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        applicationId: 'galt_20260728_fallback',
        icpFit: true,
        analyticsRecorded: false,
        notificationReceipt: 'msg_fallback_receipt',
      }),
    });
  });

  await page.goto('/galt/', { waitUntil: 'domcontentloaded' });
  await fillQualifiedApplication(page);
  await page.getByRole('button', { name: 'Submit application' }).click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__operatorEvents.some(
          (item) =>
            item.event === 'operator_application_submitted' &&
            item.properties.capture_source === 'browser_fallback',
        ),
      ),
    )
    .toBe(true);
});

test('is keyboard-readable, accessible and free of horizontal overflow', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One accessibility engine is sufficient.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/galt/', { waitUntil: 'domcontentloaded' });

  const documentWidth = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(documentWidth.scroll).toBeLessThanOrEqual(documentWidth.client + 1);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
