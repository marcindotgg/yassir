// Playwright smoke run against live scryfall.com with the built extension loaded.
// Build first:  npx wxt build          (→ dist/chrome-mv3)
// Then:         node tests/e2e/smoke.mjs
//
// Google Chrome >= 137 ignores --load-extension, so this uses Playwright's own
// Chromium build: npx playwright install chromium
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXT = process.env.EXT_DIR ?? path.join(ROOT, 'dist/chrome-mv3');
const OUT = path.join(ROOT, 'tests/e2e/.state');

if (!fs.existsSync(path.join(EXT, 'manifest.json'))) {
  console.error(`No build at ${EXT} — run \`npx wxt build\` first.`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqb-e2e-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: process.env.HEADED !== '1',
  channel: 'chromium',
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));

const results = [];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`PASS  ${name}${detail ? ` → ${detail}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
    console.log(`FAIL  ${name}: ${err.message}`);
  }
};

/** Runs `fn` in the page and returns its result; shorthand for the shadow-root pokes below. */
const inPage = (fn, arg) => page.evaluate(fn, arg);
const shadowText = () => inPage(() => document.querySelector('scryfall-query-builder')?.shadowRoot?.textContent ?? '');
const setsInput = () => inPage(() => {
  const root = document.querySelector('scryfall-query-builder').shadowRoot;
  return [...root.querySelectorAll('input')].some((i) => i.getAttribute('role') === 'combobox');
});

await step('mounts on the homepage', async () => {
  await page.goto('https://scryfall.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('scryfall-query-builder', { state: 'attached', timeout: 20000 });
  return 'host element present';
});

await step('panel matches Scryfall’s dark hero', async () => {
  const theme = await inPage(() => document.querySelector('scryfall-query-builder').dataset.theme);
  if (theme !== 'dark') throw new Error(`expected data-theme=dark, got ${theme}`);
  return 'data-theme=dark';
});

await step('focusing the search box opens the modal over it', async () => {
  await page.fill('input#q', 't:instant');
  await page.evaluate(() => document.querySelector('input#q').blur());
  await page.click('input#q');
  await page.waitForFunction(() => !!document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-mirror'), null, { timeout: 5000 });
  const geo = await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    const mirror = root.querySelector('.sqb-mirror');
    const a = document.querySelector('input#q').getBoundingClientRect();
    const b = mirror.getBoundingClientRect();
    return {
      dx: Math.abs(a.left - b.left) + Math.abs(a.right - b.right),
      dy: Math.abs(a.top - b.top) + Math.abs(a.bottom - b.bottom),
      value: mirror.value,
      focused: root.activeElement === mirror,
      font: getComputedStyle(mirror).fontSize === getComputedStyle(document.querySelector('input#q')).fontSize,
    };
  });
  await page.screenshot({ path: path.join(OUT, 'modal.png') });
  // The illusion only holds if the copy sits exactly on the original.
  if (geo.dx > 1 || geo.dy > 1) throw new Error(`mirror is off by ${geo.dx}px / ${geo.dy}px`);
  if (geo.value !== 't:instant' || !geo.focused || !geo.font) throw new Error(JSON.stringify(geo));
  return 'mirror on top of input#q, same text, focused';
});

await step('typing in the modal writes through to the real box', async () => {
  await page.keyboard.type(' s:mh3');
  const value = await page.inputValue('input#q');
  if (value !== 't:instant s:mh3') throw new Error(`input#q holds ${value}`);
  return value;
});

await step('the set list loads from api.scryfall.com', async () => {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('scryfall-query-builder')?.shadowRoot;
      const input = [...(root?.querySelectorAll('input') ?? [])].find((i) => i.getAttribute('role') === 'combobox');
      return input && !/Loading/.test(input.placeholder);
    },
    null,
    { timeout: 30000 },
  );
  await typeSet('modern horizons');
  await page.waitForFunction(() => (document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelectorAll('.sqb-ac-item').length ?? 0) > 0, null, { timeout: 8000 });
  const rows = await inPage(() =>
    [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-ac-item')].slice(0, 3).map((b) => b.querySelector('.sqb-ac-name').textContent),
  );
  // The main sets must outrank their token/promo/supplemental children.
  if (rows[0] !== 'Modern Horizons 3') throw new Error(`unexpected ranking: ${rows.join(' | ')}`);
  return rows.join(' | ');
});

async function typeSet(value) {
  await inPage((v) => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    const input = [...root.querySelectorAll('input')].find((i) => i.getAttribute('role') === 'combobox');
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

await step('picking a set reaches the query', async () => {
  await page.screenshot({ path: path.join(OUT, 'set-dropdown.png') });
  await inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-ac-item').click());
  await page.waitForFunction(() => /s:mh3/.test(document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-qb-preview')?.textContent ?? ''), null, { timeout: 5000 });
  return inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-qb-preview').textContent);
});

await step('a second set becomes an or-group', async () => {
  await typeSet('ltr');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /\(s:mh3 or s:ltr\)/.test(document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-qb-preview')?.textContent ?? ''), null, { timeout: 5000 });
  return inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-qb-preview').textContent);
});

await step('the explainer names the set', async () => {
  const text = await inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-explain').textContent.replace(/\s+/g, ' ').trim());
  if (!/Modern Horizons 3/.test(text)) throw new Error(`set name not resolved: ${text}`);
  return text;
});

await step('a preset lands in the real search box', async () => {
  await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    [...root.querySelectorAll('button')].find((b) => /Mono-red instants/.test(b.textContent)).click();
  });
  // Preact batches the state update; wait for the preview before inserting.
  await page.waitForFunction(() => /c=r/.test(document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-qb-preview')?.textContent ?? ''), null, { timeout: 5000 });
  await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    [...root.querySelectorAll('button')].find((b) => /Replace search/.test(b.textContent)).click();
  });
  await page.screenshot({ path: path.join(OUT, 'builder.png') });
  const [value, mirror] = await Promise.all([
    page.inputValue('input#q'),
    inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-mirror').value),
  ]);
  if (!value.includes('c=r') || value !== mirror) throw new Error(`box: ${value} / mirror: ${mirror}`);
  return value;
});

await step('Escape closes it and gives focus back to the real box', async () => {
  await page.keyboard.press('Escape');
  const state = await inPage(() => ({
    open: !!document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-mirror'),
    focused: document.activeElement === document.querySelector('input#q'),
  }));
  if (state.open || !state.focused) throw new Error(JSON.stringify(state));
  return 'closed, input#q focused';
});

await step('Enter in the modal runs the search', async () => {
  await page.click('input#q');
  await page.waitForFunction(() => !!document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-mirror'), null, { timeout: 5000 });
  await Promise.all([page.waitForURL(/\/search\?/, { timeout: 15000 }), page.keyboard.press('Enter')]);
  const q = new URL(page.url()).searchParams.get('q');
  if (!q?.includes('c=r')) throw new Error(`searched for ${q}`);
  return q;
});

await step('stays off every other page', async () => {
  await page.waitForTimeout(2500);
  const n = await inPage(() => document.querySelectorAll('scryfall-query-builder').length);
  if (n !== 0) throw new Error(`mounted ${n} times on /search`);
  return 'absent on /search';
});

await ctx.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed — screenshots in ${path.relative(ROOT, OUT)}/`);
process.exit(failed.length ? 1 : 0);
