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
  channel: 'chromium', // Google Chrome 137+ ignores --load-extension
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

const inPage = (fn, arg) => page.evaluate(fn, arg);
const shadowText = () => inPage(() => document.querySelector('scryfall-query-builder')?.shadowRoot?.textContent ?? '');
const mirrorValue = () => inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-mirror').value);
const waitQuery = (re) =>
  page.waitForFunction((src) => new RegExp(src).test(document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelector('.sqb-mirror')?.value ?? ''), re, { timeout: 5000 });
const fieldValue = (label) =>
  inPage((l) => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    return [...root.querySelectorAll('.sqb-field')].find((f) => f.querySelector('.sqb-label')?.textContent.startsWith(l))?.querySelector('input')?.value ?? null;
  }, label);
const fieldInput = (label) => page.locator('.sqb-field', { has: page.locator('.sqb-label', { hasText: label }) }).locator('input').first();
const colorChips = () => inPage(() => [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-multiselect-box .sqb-chip')].map((c) => c.textContent.replace(/[✕\s]+/g, ' ').trim()));
const pinTexts = () => inPage(() => [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-pin')].map((c) => c.querySelector('.sqb-pin-text').textContent));
const pinSection = () => inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-reveal')?.className ?? null);

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
  if (geo.dx > 1 || geo.dy > 1) throw new Error(`mirror starts off by ${geo.dx}px / ${geo.dy}px`);
  if (geo.value !== 't:instant' || !geo.focused || !geo.font || !geo.hidden || !geo.widened) throw new Error(JSON.stringify(geo));
  return 'mirror starts on top of input#q, same text, focused; original hidden; widens open';
});

await step('the form opens filled in from the query', async () => {
  const type = await fieldValue('Type');
  if (type !== 'instant') throw new Error(`Type field holds ${JSON.stringify(type)}`);
  return `Type = ${type}`;
});

await step('typing in the modal writes through to the real box', async () => {
  await page.keyboard.type(' s:ltr');
  const value = await page.inputValue('input#q');
  if (value !== 't:instant s:ltr') throw new Error(`input#q holds ${value}`);
  return value;
});

/** Every visible row of the open list must be on top where it is drawn, not covered or cut off by the modal body. */
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
        return r.bottom > box.top && r.top < box.bottom;
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
      const input = root?.querySelector('.sqb-sets input[role=combobox]');
      return input && !/Loading/.test(input.placeholder);
    },
    null,
    { timeout: 30000 },
  );
  await typeSet('modern horizons');
  await page.waitForFunction(() => (document.querySelector('scryfall-query-builder')?.shadowRoot?.querySelectorAll('.sqb-sets .sqb-option').length ?? 0) > 0, null, { timeout: 8000 });
  const rows = await inPage(() =>
    [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-sets .sqb-option')].slice(0, 3).map((b) => b.querySelector('.sqb-option-name').textContent),
  );
  if (rows[0] !== 'Modern Horizons 3') throw new Error(`unexpected ranking: ${rows.join(' | ')}`);
  return rows.join(' | ');
});

async function typeSet(value) {
  await inPage((v) => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    const input = root.querySelector('.sqb-sets input[role=combobox]');
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

await step('a set typed into the query shows as a chip; a picked one joins it in place', async () => {
  const chips = await inPage(() => [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-sets .sqb-chip')].map((c) => c.textContent));
  if (!chips.some((c) => /ltr/i.test(c))) throw new Error(`set chips: ${chips}`);
  await page.screenshot({ path: path.join(OUT, 'set-dropdown.png') });
  const covered = await listOnTop('.sqb-sets .sqb-dropdown');
  if (covered) throw new Error(`set list: ${covered}`);
  await inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-sets .sqb-option').click());
  await waitQuery('^t:instant \\(s:ltr or s:mh3\\)$');
  const value = await page.inputValue('input#q');
  if (value !== (await mirrorValue())) throw new Error(`input#q holds ${value}`);
  return value;
});

await step('removing a set chip takes it out of the query', async () => {
  await inPage(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-sets .sqb-chip .sqb-chip-remove').click());
  await waitQuery('^t:instant s:mh3$');
  return mirrorValue();
});

await step('a condition the form has no field for opens a section with a named pin that removes it', async () => {
  if ((await pinSection()) !== null) throw new Error('the section is there with nothing to pin');
  await page.locator('.sqb-mirror').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' kw:flying -is:reprint');
  await page.waitForFunction(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-pin').length === 2, null, { timeout: 5000 });
  const pins = await pinTexts();
  if (pins.join('|') !== 'Keyword: flying|not Reprint') throw new Error(`pins: ${pins}`);
  const section = await pinSection();
  if (!section.includes('sqb-reveal-enter')) throw new Error(`typed in, the section should open up: ${section}`);
  await page.screenshot({ path: path.join(OUT, 'pins.png') });
  await page.locator('.sqb-pin', { hasText: 'Keyword: flying' }).locator('.sqb-chip-remove').click();
  await waitQuery('^t:instant s:mh3 -is:reprint$');
  const focused = await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    return root.activeElement === root.querySelector('.sqb-mirror');
  });
  if (!focused) throw new Error('focus did not go back to the query');
  await page.locator('.sqb-pin', { hasText: 'not Reprint' }).locator('.sqb-chip-remove').click();
  await waitQuery('^t:instant s:mh3$');
  await page.waitForFunction(() => !document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-reveal'), null, { timeout: 2000 });
  return `pins: ${pins.join(', ')}; both removed, section folded away`;
});

await step('retyping the only condition updates its pin in place, once typing pauses', async () => {
  await page.locator('.sqb-mirror').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' kw:flying');
  await page.waitForFunction(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-pin'), null, { timeout: 5000 });
  // Tag the section and the pin: a re-mounted one wouldn't carry the tag.
  await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    root.querySelector('.sqb-reveal').sqbProbe = true;
    root.querySelector('.sqb-pin').sqbProbe = true;
  });
  for (let i = 0; i < 'flying'.length; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('haste');
  const early = await pinTexts();
  if (early.join('|') !== 'Keyword: flying') throw new Error(`pins changed while still typing: ${early}`);
  await page.waitForFunction(() => document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-pin-text')?.textContent === 'Keyword: haste', null, { timeout: 5000 });
  const kept = await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    return { section: root.querySelector('.sqb-reveal')?.sqbProbe === true, pin: root.querySelector('.sqb-pin')?.sqbProbe === true };
  });
  if (!kept.section || !kept.pin) throw new Error(`re-mounted: ${JSON.stringify(kept)}`);
  await page.locator('.sqb-pin').locator('.sqb-chip-remove').click();
  await waitQuery('^t:instant s:mh3$');
  await page.waitForFunction(() => !document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-reveal'), null, { timeout: 2000 });
  return 'flying → haste in the same pin, section never folded';
});

await step('typing into a field keeps its spaces and operators while the query follows', async () => {
  await fieldInput('Rules text').click();
  await page.keyboard.type('draw a card');
  await waitQuery('^t:instant s:mh3 o:draw o:a o:card$');
  const text = await fieldValue('Rules text');
  if (text !== 'draw a card') throw new Error(`Rules text field holds ${JSON.stringify(text)}`);
  await fieldInput('Mana value').click();
  await page.keyboard.type('>=');
  const operator = await fieldValue('Mana value');
  if (operator !== '>=') throw new Error(`Mana value field holds ${JSON.stringify(operator)}`);
  await page.keyboard.type('3');
  await waitQuery('^t:instant s:mh3 o:draw o:a o:card mv>=3$');
  await fieldInput('Rules text').fill('');
  await fieldInput('Mana value').fill('');
  await waitQuery('^t:instant s:mh3$');
  return 'o:draw o:a o:card, then mv>=3, then both gone';
});

await step('oracle tag suggestions complete the word being typed', async () => {
  await fieldInput('Oracle tag').click();
  await page.keyboard.type('rock');
  await page.locator('.sqb-dropdown .sqb-option', { hasText: 'mana-rock' }).click();
  await waitQuery('^t:instant s:mh3 otag:mana-rock$');
  const listOpen = await inPage(() => !!document.querySelector('scryfall-query-builder').shadowRoot.querySelector('.sqb-dropdown'));
  if (listOpen) throw new Error('the list should close once a suggestion is picked');
  await fieldInput('Oracle tag').fill('');
  await waitQuery('^t:instant s:mh3$');
  return 'rock → mana-rock, list closed, then cleared';
});

await step('the colors multiselect: groups exclude each other, Escape only closes its list', async () => {
  const pick = async (label) => page.locator('.sqb-multiselect-list button', { hasText: label }).first().click();

  await page.locator('.sqb-multiselect-input').click();
  await page.waitForSelector('.sqb-multiselect-list', { timeout: 3000 });
  await pick('Izzet');
  await pick('Boros');
  await waitQuery('\\(c=izzet or c=boros\\)');
  const covered = await listOnTop('.sqb-multiselect-list');
  if (covered) throw new Error(`colors list: ${covered}`);
  const groups = await inPage(() => [...document.querySelector('scryfall-query-builder').shadowRoot.querySelectorAll('.sqb-multiselect-group-label')].map((g) => g.textContent));
  if (groups.join('|') !== 'Colors|Guilds|Shards|Wedges|Four colors|Five colors') throw new Error(`groups: ${groups}`);
  await pick('Red');
  await waitQuery('(^| )c=r( |$)');
  if ((await mirrorValue()).includes('izzet')) throw new Error(`a single color should clear the combinations: ${await mirrorValue()}`);
  await pick('Jund');
  await waitQuery('c=jund');
  if (/(^| )c=r\b/.test(await mirrorValue())) throw new Error(`a combination should clear the single colors: ${await mirrorValue()}`);
  await pick('Colorless');
  await waitQuery('c=c');
  const afterColorless = await colorChips();
  if (afterColorless.join('|') !== 'Colorless') throw new Error(`chips after colorless: ${afterColorless}`);
  await page.screenshot({ path: path.join(OUT, 'colors.png') });

  await page.keyboard.press('Escape');
  const state = await inPage(() => {
    const root = document.querySelector('scryfall-query-builder').shadowRoot;
    return { list: !!root.querySelector('.sqb-multiselect-list'), modal: !!root.querySelector('.sqb-mirror') };
  });
  if (state.list || !state.modal) throw new Error(`Escape should close only the list: ${JSON.stringify(state)}`);
  return `chips: ${afterColorless.join(', ')}; ${await mirrorValue()}`;
});

await step('picking a color replaces colorless where it stood', async () => {
  await page.locator('.sqb-multiselect-input').click();
  await page.waitForSelector('.sqb-multiselect-list', { timeout: 3000 });
  await page.locator('.sqb-multiselect-list button', { hasText: 'Red' }).first().click();
  await waitQuery('^t:instant s:mh3 c=r$');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(OUT, 'builder.png') });
  const [value, mirror] = await Promise.all([page.inputValue('input#q'), mirrorValue()]);
  if (value !== mirror) throw new Error(`box: ${value} / mirror: ${mirror}`);
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
  // Something for a pin, so the results page opens with one.
  await page.keyboard.press('End');
  await page.keyboard.type(' kw:haste');
  await Promise.all([page.waitForURL(/\/search\?/, { timeout: 15000 }), page.keyboard.press('Enter')]);
  const q = new URL(page.url()).searchParams.get('q');
  if (!q?.includes('c=r')) throw new Error(`searched for ${q}`);
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

await step('after the page loads anew, the form reads the query it was left with', async () => {
  // Read straight away: a condition the query already has is pinned from the start, not after a pause.
  const [type, colors, pins, section] = await Promise.all([fieldValue('Type'), colorChips(), pinTexts(), pinSection()]);
  if (type !== 'instant' || colors.join('|') !== 'Red' || pins.join('|') !== 'Keyword: haste') throw new Error(JSON.stringify({ type, colors, pins }));
  if (section !== 'sqb-reveal') throw new Error(`there from the start, the section should come with the sheet: ${section}`);
  return `Type = ${type}, Colors = ${colors.join(', ')}, pinned: ${pins.join(', ')}`;
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
