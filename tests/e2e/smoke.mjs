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
  return !!root.querySelector('.sqb-ac input[role=combobox]');
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
    // Measure the first frame of the open animation, then let it run out.
    const anims = root.querySelector('.sqb-modal').getAnimations({ subtree: true });
    anims.forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
    const a = document.querySelector('input#q').getBoundingClientRect();
    const b = mirror.getBoundingClientRect();
    anims.forEach((a) => a.finish());
    const opened = mirror.getBoundingClientRect();
    return {
      widened: opened.width > a.width + 100,
      hidden: getComputedStyle(document.querySelector('input#q')).visibility === 'hidden',
      dx: Math.abs(a.left - b.left) + Math.abs(a.right - b.right),
      dy: Math.abs(a.top - b.top) + Math.abs(a.bottom - b.bottom),
      value: mirror.value,
      focused: root.activeElement === mirror,
      font: getComputedStyle(mirror).fontSize === getComputedStyle(document.querySelector('input#q')).fontSize,
    };
  });
  await page.screenshot({ path: path.join(OUT, 'modal.png') });
  // The illusion only holds if the copy starts exactly on the original.
  if (geo.dx > 1 || geo.dy > 1) throw new Error(`mirror starts off by ${geo.dx}px / ${geo.dy}px`);
  if (geo.value !== 't:instant' || !geo.focused || !geo.font || !geo.hidden || !geo.widened) throw new Error(JSON.stringify(geo));
  return 'mirror starts on top of input#q, same text, focused; original hidden; widens open';
});

await step('typing in the modal writes through to the real box', async () => {
  await page.keyboard.type(' s:mh3');
  const value = await page.inputValue('input#q');
  if (value !== 't:instant s:mh3') throw new Error(`input#q holds ${value}`);
  return value;
});

/** Every row of the open list `sel` must be on top where it is drawn, and not cut off by the modal body. */
const listOnTop = (sel) =>
  inPage((selector) => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    const list = root.querySelector(selector);
    if (!list) return 'no list';
    const body = root.querySelector('.sqb-sheet-body').getBoundingClientRect();
    const box = list.getBoundingClientRect();
    if (box.top < body.top - 1 || box.bottom > body.bottom + 1) return `list ${Math.round(box.top)}-${Math.round(box.bottom)} outside the body ${Math.round(body.top)}-${Math.round(body.bottom)}`;
    const bad = [...list.querySelectorAll('button')]
      .filter((row) => {
        const r = row.getBoundingClientRect();
        return r.bottom > box.top && r.top < box.bottom; // rows scrolled into the list's view
      })
      .filter((row) => {
        const r = row.getBoundingClientRect();
        const y = Math.min(Math.max((r.top + r.bottom) / 2, box.top + 2), box.bottom - 2);
        const hit = root.elementFromPoint(r.left + 20, y);
        return !hit || !list.contains(hit);
      });
    return bad.length ? `covered rows: ${bad.map((b) => b.textContent.trim()).join(', ')}` : '';
  }, sel);

await step('the set list loads from api.scryfall.com', async () => {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('scryfall-query-builder')?.shadowRoot;
      const input = root?.querySelector('.sqb-ac input[role=combobox]');
      return input && !/Loading/.test(input.placeholder);
    },
    null,
    { timeout: 30000 },
  );
  await typeSet('modern horizons');
  await page.waitForFunction(() => (document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelectorAll('.sqb-ac .sqb-ac-item').length ?? 0) > 0, null, { timeout: 8000 });
  const rows = await inPage(() =>
    [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-ac .sqb-ac-item')].slice(0, 3).map((b) => b.querySelector('.sqb-ac-name').textContent),
  );
  // The main sets must outrank their token/promo/supplemental children.
  if (rows[0] !== 'Modern Horizons 3') throw new Error(`unexpected ranking: ${rows.join(' | ')}`);
  return rows.join(' | ');
});

async function typeSet(value) {
  await inPage((v) => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    const input = root.querySelector('.sqb-ac input[role=combobox]');
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

await step('picking a set reaches the query', async () => {
  await page.screenshot({ path: path.join(OUT, 'set-dropdown.png') });
  const covered = await listOnTop('.sqb-ac .sqb-ac-list');
  if (covered) throw new Error(`set list: ${covered}`);
  await inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-ac .sqb-ac-item').click());
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

await step('the colors multiselect: groups exclude each other, Escape only closes its list', async () => {
  const preview = () => inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-qb-preview').textContent);
  const chips = () => inPage(() => [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-ms-box .sqb-chip')].map((c) => c.textContent.replace(/[✕\s]+/g, ' ').trim()));
  const pick = async (label) => page.locator('.sqb-ms-list button', { hasText: label }).first().click();
  const waitPreview = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-qb-preview')?.textContent ?? ''), re, { timeout: 5000 });

  await page.locator('.sqb-ms-input').click();
  await page.waitForSelector('.sqb-ms-list', { timeout: 3000 });
  await pick('Izzet');
  await pick('Boros');
  await waitPreview('\\(c=izzet or c=boros\\)');
  const covered = await listOnTop('.sqb-ms-list');
  if (covered) throw new Error(`colors list: ${covered}`);
  const groups = await inPage(() => [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-ms-group-label')].map((g) => g.textContent));
  if (groups.join('|') !== 'Colors|Guilds|Shards|Wedges|Four colors|Five colors') throw new Error(`groups: ${groups}`);
  await pick('Red');
  await waitPreview('(^| )c<=r( |$)');
  if ((await preview()).includes('izzet')) throw new Error(`a single color should clear the combinations: ${await preview()}`);
  await pick('Jund');
  await waitPreview('c=jund');
  if (/c<=r\b/.test(await preview())) throw new Error(`a combination should clear the single colors: ${await preview()}`);
  await pick('Colorless');
  await waitPreview('c:c');
  const afterColorless = await chips();
  if (afterColorless.join('|') !== 'Colorless') throw new Error(`chips after colorless: ${afterColorless}`);
  await page.screenshot({ path: path.join(OUT, 'colors.png') });

  await page.keyboard.press('Escape');
  const state = await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    return { list: !!root.querySelector('.sqb-ms-list'), modal: !!root.querySelector('.sqb-mirror') };
  });
  if (state.list || !state.modal) throw new Error(`Escape should close only the list: ${JSON.stringify(state)}`);
  return `chips: ${afterColorless.join(', ')}; ${await preview()}`;
});

await step('a preset lands in the real search box', async () => {
  await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    [...root.querySelectorAll('button')].find((b) => /Red instants/.test(b.textContent)).click();
  });
  // Preact batches the state update; wait for the preview before inserting.
  await page.waitForFunction(() => /c<=r/.test(document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-qb-preview')?.textContent ?? ''), null, { timeout: 5000 });
  await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    [...root.querySelectorAll('button')].find((b) => /Replace search/.test(b.textContent)).click();
  });
  await page.screenshot({ path: path.join(OUT, 'builder.png') });
  const [value, mirror] = await Promise.all([
    page.inputValue('input#q'),
    inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-mirror').value),
  ]);
  if (!value.includes('c<=r') || value !== mirror) throw new Error(`box: ${value} / mirror: ${mirror}`);
  return value;
});

await step('Escape closes it and gives focus back to the real box', async () => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-mirror'), null, { timeout: 2000 });
  const state = await inPage(() => ({
    open: !!document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-mirror'),
    focused: document.activeElement === document.querySelector('input#q'),
    visible: getComputedStyle(document.querySelector('input#q')).visibility === 'visible',
  }));
  if (state.open || !state.focused || !state.visible) throw new Error(JSON.stringify(state));
  return 'closed, input#q visible and focused';
});

await step('Enter in the modal runs the search', async () => {
  await page.click('input#q');
  await page.waitForFunction(() => !!document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-mirror'), null, { timeout: 5000 });
  await Promise.all([page.waitForURL(/\/search\?/, { timeout: 15000 }), page.keyboard.press('Enter')]);
  const q = new URL(page.url()).searchParams.get('q');
  if (!q?.includes('c<=r')) throw new Error(`searched for ${q}`);
  return q;
});

await step('on /search the header box opens it, unfolding downwards', async () => {
  await page.waitForSelector('scryfall-query-builder', { state: 'attached', timeout: 20000 });
  await inPage(() => document.querySelector('#header-search-field').blur());
  await page.click('#header-search-field');
  await page.waitForFunction(() => !!document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-mirror'), null, { timeout: 5000 });
  const geo = await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    const mirror = root.querySelector('.sqb-mirror');
    const anims = root.querySelector('.sqb-modal').getAnimations({ subtree: true });
    anims.forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
    const a = document.querySelector('#header-search-field').getBoundingClientRect();
    const start = mirror.getBoundingClientRect();
    anims.forEach((a) => a.finish());
    const end = mirror.getBoundingClientRect();
    return {
      dx: Math.abs(a.left - start.left) + Math.abs(a.right - start.right),
      dy: Math.abs(a.top - start.top) + Math.abs(a.bottom - start.bottom),
      down: end.top > start.top,
      value: mirror.value,
      // The header box is see-through; the copy must carry the header's colour.
      opaque: !/rgba\(.*, 0\)/.test(getComputedStyle(mirror).backgroundColor),
    };
  });
  await page.screenshot({ path: path.join(OUT, 'modal-header.png') });
  if (geo.dx > 1 || geo.dy > 1) throw new Error(`mirror starts off by ${geo.dx}px / ${geo.dy}px`);
  const q = new URL(page.url()).searchParams.get('q');
  if (!geo.down || !geo.opaque || geo.value !== q) throw new Error(JSON.stringify({ ...geo, q }));
  return `starts on the header box, settles lower, holds "${geo.value}"`;
});

await step('Escape on /search hands focus back to the header box', async () => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-mirror'), null, { timeout: 2000 });
  const focused = await inPage(() => document.activeElement === document.querySelector('#header-search-field'));
  if (!focused) throw new Error('header box not focused');
  return 'closed after the close animation, header box focused';
});

await ctx.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed — screenshots in ${path.relative(ROOT, OUT)}/`);
process.exit(failed.length ? 1 : 0);
