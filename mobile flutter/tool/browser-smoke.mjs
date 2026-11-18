import { chromium, expect } from '../../frontend/node_modules/@playwright/test/index.mjs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const output = new URL('../build/verification/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
const apiCalls = [];
const password = randomUUID();
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  const url = new URL(response.url());
  if (url.pathname.startsWith('/v1/')) apiCalls.push({ path: url.pathname, status: response.status() });
});
async function enter(label, value, { verify = true } = {}) {
  const field = page.getByRole('textbox', { name: label });
  await field.click();
  await page.waitForTimeout(150);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(value, { delay: 20 });
  await page.waitForTimeout(150);
  if (verify) await expect(field).toHaveValue(value);
}
try {
  await page.goto(process.env.SUPERAGENT_WEB_URL ?? 'http://127.0.0.1:8080');
  // Activate Flutter's supported accessibility placeholder for semantic selectors.
  await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('sign-in-390.png', output)) });
  await page.getByRole('button', { name: 'New here? Create a workspace', exact: true }).click();
  await enter('Business name', 'Atlas Mobile Test');
  await enter('Email', `mobile-smoke-${randomUUID().slice(0, 8)}@example.com`);
  await enter('Password', password, { verify: false });
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: fileURLToPath(new URL('home-390.png', output)) });
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL(`home-${width}.png`, output)) });
  }
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  for (const name of ['Chat', 'Inbox', 'Agents', 'Docs', 'Company Brain', 'Workflows', 'Canvas', 'Example Home', 'Example Board']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await page.mouse.move(400, 400);
  await page.screenshot({ path: fileURLToPath(new URL('drawer-430.png', output)) });
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: 'Record order', exact: true }).click();
  for (const [label, value] of [['Customer name', 'Browser customer'], ['Phone', '+212600000002'], ['Item', 'Test bag'], ['Quantity', '2'], ['Unit price (MAD)', '125.50'], ['Delivery fee (MAD)', '20.00'], ['Delivery address', 'Synthetic browser test address']]) {
    await enter(label, value);
  }
  await page.getByRole('button', { name: 'Save order details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to orders', exact: true })).toBeVisible();
  await page.mouse.wheel(0, 1200);
  await expect(page.getByRole('textbox', { name: /^Customer decision evidence/ })).toBeVisible();
  await page.getByRole('textbox', { name: /^Customer decision evidence/ }).click();
  await page.keyboard.type('Synthetic customer confirmed the exact reviewed summary.', { delay: 20 });
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
  // Flutter paints text on canvas and exposes it through semantic labels.
  await expect(page.getByLabel(/CONFIRMED/)).toBeVisible();
  await page.mouse.wheel(0, -1800);
  await page.screenshot({ path: fileURLToPath(new URL('confirmed-order-430.png', output)) });
  console.log(JSON.stringify({ apiCalls, browserErrors: errors, screenshots: output.pathname }));
  expect(errors).toEqual([]);
  expect(apiCalls.some(call => call.path.endsWith('/auth/registrations') && call.status === 201)).toBeTruthy();
  expect(apiCalls.some(call => call.path.endsWith('/dashboard/outcomes') && call.status === 200)).toBeTruthy();
  expect(apiCalls.some(call => call.path.endsWith('/order-attempts') && call.status === 201)).toBeTruthy();
  expect(apiCalls.some(call => call.path.endsWith('/decisions') && call.status === 201)).toBeTruthy();
} catch (error) {
  await page.screenshot({ path: fileURLToPath(new URL('browser-failure.png', output)) });
  const labels = await Promise.all((await page.getByRole('textbox').all()).map(field => field.getAttribute('aria-label')));
  console.error(JSON.stringify({ apiCalls, browserErrors: errors, fieldLabels: labels,
    failure: error.message.replaceAll(password, '[redacted]') }));
  throw new Error(`Browser smoke check failed (${error.name}); inspect the screenshot and safe diagnostics above.`);
} finally {
  await browser.close();
}
