/**
 * Drives the real UI in Chromium and fails on anything a unit test cannot see:
 * console errors, uncaught exceptions, failed requests, or a screen that renders
 * implausible data.
 *
 * Usage: start the API and the client, then
 *   BASE=http://localhost:5173 node e2e/verify.mjs
 *
 * Requires the browser binary once: npx playwright install chromium
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SHOTS = process.env.SHOTS ?? 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const problems = [];
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  const failure = request.failure()?.errorText ?? '';
  // Aborting an in-flight SSE stream on unmount is expected.
  if (!failure.includes('ABORTED')) problems.push(`requestfailed: ${request.url()} ${failure}`);
});

const shot = async (name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  console.log(`  shot: ${name}`);
};

const step = async (label, fn) => {
  process.stdout.write(`▶ ${label}\n`);
  await fn();
};

const email = `browser-${Date.now()}@example.com`;

try {
  await step('login screen', async () => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('text=Sign in');
    await shot('01-login');
  });

  await step('register a new account', async () => {
    await page.goto(`${BASE}/register`);
    await page.fill('#email', email);
    await page.fill('#display-name', 'Browser Check');
    await page.fill('#password', 'supersecret123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/runs', { timeout: 15000 });
    await page.waitForSelector('text=New run');
    await shot('02-dashboard-empty');
  });

  await step('submit a goal', async () => {
    await page.getByText('use example goal').click();
    await page.getByRole('button', { name: 'Run goal' }).click();
    await page.waitForURL(/\/runs\/[0-9a-f-]{36}/, { timeout: 15000 });
  });

  await step('run detail while live', async () => {
    await page.waitForSelector('text=live', { timeout: 10000 });
    await page.waitForTimeout(1400);
    await shot('03-run-live');
  });

  await step('run detail once complete', async () => {
    await page.waitForSelector('text=Final output', { timeout: 40000 });
    await shot('04-run-done');
  });

  await step('expand a step with tool calls', async () => {
    await page.locator('ol li button').first().click();
    await page.waitForTimeout(300);
    const toolCall = page.locator('text=/^web_search$/').first();
    if (await toolCall.count()) {
      await toolCall.click();
      await page.waitForTimeout(300);
    }
    await shot('05-step-expanded');
  });

  await step('dashboard with a completed run', async () => {
    await page.getByRole('link', { name: 'Runs', exact: true }).click();
    await page.waitForSelector('table');
    await shot('06-dashboard-list');

    // A run submitted seconds ago must not render as hours old, and a run that
    // took seconds must not report a duration in hours. Both regress the moment
    // timestamps lose their UTC offset.
    const body = await page.locator('body').innerText();
    const stale = body.match(/\b(\d+)\s*h\s*ago\b/);
    if (stale) problems.push(`stale relative time on dashboard: ${stale[0]}`);
    const longDuration = body.match(/\b(\d+)m\s\d+s\b/);
    if (longDuration && Number(longDuration[1]) > 5) {
      problems.push(`implausible duration on dashboard: ${longDuration[0]}`);
    }
  });

  await step('evals view', async () => {
    await page.getByRole('link', { name: 'Evals' }).click();
    await page.waitForSelector('text=Scenarios', { timeout: 10000 });
    await shot('07-evals');
  });

  await step('run the eval suite', async () => {
    await page.getByRole('button', { name: /^Run evals$/ }).click();
    await page.waitForSelector('text=Results', { timeout: 20000 });
    await page.waitForTimeout(2500);
    await shot('08-evals-running');
    // Wait for the suite to finish: the button returns to its idle label.
    await page.waitForFunction(
      () => !document.body.innerText.includes('Suite running'),
      undefined,
      { timeout: 120000 },
    );
    await page.waitForTimeout(800);
    await shot('09-evals-done');
  });

  await step('settings view', async () => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForSelector('text=Model provider', { timeout: 10000 });
    await shot('10-settings');
  });

  await step('edit a sub-agent', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.waitForSelector('text=Tool access');
    await shot('11-settings-agent-form');
  });

  await step('reload to confirm session restore', async () => {
    await page.goto(`${BASE}/evals`);
    await page.waitForSelector('text=Score trend', { timeout: 10000 });
    await shot('12-evals-trend-after-reload');
  });
} catch (error) {
  problems.push(`FLOW FAILURE: ${error.message}`);
  await page.screenshot({ path: `${SHOTS}/99-failure.png`, fullPage: true });
}

await browser.close();

console.log('\n================ RESULT ================');
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const problem of [...new Set(problems)]) console.log(`  - ${problem}`);
  process.exit(1);
}
console.log('clean: no console errors, no page errors, all flows completed');
