import { test, expect } from '@playwright/test';

// Collect console errors and CSP violations for every test.
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/tile|arcgisonline|fonts\.g|ERR_(INTERNET|NAME|BLOCKED|CONNECTION)|Failed to load resource/i.test(m.text())) page.errors.push(m.text());
    if (/Content Security Policy/i.test(m.text())) page.errors.push('CSP: ' + m.text());
  });
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// Phones open on the map; the details panel sits behind a toggle.
const showPanel = async (page) => {
  const li = page.locator('#panel ul.list li').first();
  await expect(li).toBeAttached();
  if (!(await li.isVisible())) await page.click('#mapToggle');
  await expect(li).toBeVisible();
};
const ready = async (page) => { await page.goto('/index.html'); await showPanel(page); };

test('atlas boots with real data and lists districts', async ({ page }) => {
  await ready(page);
  expect(await page.locator('#panel ul.list li').count()).toBeGreaterThan(20);
  await expect(page.locator('#map .leaflet-overlay-pane path').first()).toBeAttached();
  await expect(page.locator('#dekadSelect option').first()).toBeAttached();
});

test('selecting a district shows its panel, Escape goes back', async ({ page }) => {
  await ready(page);
  const name = (await page.locator('#panel ul.list li').first().innerText()).split('\n')[0];
  await page.locator('#panel ul.list li').first().click();
  await expect(page.locator('#panel h1')).toContainText(name.trim().slice(0, 4));
  await page.keyboard.press('Escape');
  await showPanel(page);
});

test('district can be opened from the URL hash; a hostile hash is ignored', async ({ page }) => {
  await page.goto('/index.html#PK.KP.CHA');
  await expect(page.locator('#panel h1')).not.toHaveText('');
  await page.goto('/index.html#../../etc/passwd');
  await showPanel(page);
});

test('language switch sets RTL for Urdu and Pashto and persists', async ({ page }) => {
  await ready(page);
  await page.selectOption('#langSelect', 'ur');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.selectOption('#langSelect', 'ps');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.selectOption('#langSelect', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('transient 429/503 from the data host are retried and the app still loads', async ({ page }) => {
  const hits = {};
  await page.route('**/data/meta.json*', (route) => {
    hits.meta = (hits.meta || 0) + 1;
    if (hits.meta === 1) return route.fulfill({ status: 429, headers: { 'Retry-After': '0' }, body: '' });
    if (hits.meta === 2) return route.fulfill({ status: 503, body: '' });
    return route.continue();
  });
  await ready(page);
  expect(hits.meta).toBeGreaterThanOrEqual(3);
});

test('a missing series renders a no-data message, not zero', async ({ page }) => {
  await page.route('**/data/series/*', (route) => route.fulfill({ status: 404, body: '' }));
  await ready(page);
  await page.locator('#panel ul.list li').first().click();
  await expect(page.locator('#panel')).not.toContainText('Could not load');
  await expect(page.locator('#panel .hint').first()).toBeVisible();
});

test('all data unreachable: offline snapshot keeps the atlas usable', async ({ page }) => {
  await page.route('**/data/**', (route) => route.fulfill({ status: 500, body: '' }));
  await page.route('**/../data/**', (route) => route.fulfill({ status: 500, body: '' }));
  await page.goto('/index.html');
  await showPanel(page);
  await expect(page.locator('#offlineBadge')).not.toHaveAttribute('hidden', /.*/, { timeout: 30_000 });
});

test('methods page renders sanitised markdown and the validation table', async ({ page }) => {
  await page.goto('/methods.html');
  await expect(page.locator('#methods h1, #methods h2').first()).toBeVisible();
  expect(await page.locator('#methods script, #methods iframe, #methods [onclick]').count()).toBe(0);
  await expect(page.locator('#validationTable tr').first()).toBeAttached();
});

test('sanitiser strips scripts, handlers and javascript: links', async ({ page }) => {
  await page.goto('/methods.html');
  const out = await page.evaluate(() => Atlas.sanitize.html(
    '<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><img src=x onerror=alert(1)><a href="https://ok.example">ok</a>'));
  expect(out).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
  expect(out).toContain('rel="noopener noreferrer"');
});

test('guide page loads', async ({ page }) => {
  await page.goto('/guide.html');
  await expect(page.locator('#doc h1').first()).toBeVisible();
});

test('every page ships a CSP and the server sends security headers', async ({ page, request }) => {
  for (const p of ['index', 'methods', 'guide']) {
    const r = await request.get(`/${p}.html`);
    expect(r.headers()['x-content-type-options']).toBe('nosniff');
    expect(await r.text()).toContain('Content-Security-Policy');
  }
  expect((await request.post('/index.html')).status()).toBe(405);
  expect((await request.get('/%2e%2e/package.json')).status()).not.toBe(200);
});
