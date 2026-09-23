# Scryfall Query Builder

A standalone browser extension that adds an advanced search builder to
[scryfall.com](https://scryfall.com): a form for Scryfall's search syntax, an
explainer that translates a query back into plain English, and set-name
autocomplete backed by the Scryfall API.

It was split out of the [MTGenie extension](../extension), which keeps
everything collection-related (ownership badges, price charts, the collection
panel). This one touches nothing but the homepage search box and talks to no
backend other than Scryfall's public API.

## What it does

- **Search modal** — focusing the homepage search box opens a sheet with a copy
  of the box on top, laid exactly over the original (same styles, text, caret
  and logo), so it reads as the same input growing a panel. Both boxes stay in
  sync; Enter searches, Escape hands focus back to Scryfall's box, a click
  outside closes it. The explainer and the builder live in the sheet.
- **Query builder** — name, rules text,
  type, colors (with `c=` / `c<=` / `c>=` / `id<=`), mana value, rarity, sets,
  format, max price, power/toughness, artist, year, `is:` flags and sorting,
  with a live preview of the query it produces. *Replace search* or *Add to
  search* writes it into the box; *Search* runs it.
- **Set autocomplete** — type a set name or code and pick from a ranked list
  (set symbol, name, code, year, card count). Pick several and they become
  `(s:mh3 or s:ltr)`. The list comes from `https://api.scryfall.com/sets`,
  fetched by the background worker and cached in `storage.local` for 24 hours,
  so normal use costs one request a day.
- **Query explainer** — explains whatever is in the box as you type, operator
  by operator; unknown tokens are flagged rather than dropped. Set
  codes are resolved to names (`s:mh3` → "set is Modern Horizons 3 (mh3)").

## Layout

```
entrypoints/        background.ts (set list + cache), scryfall.content.tsx
src/background/     the Scryfall /sets fetch, its cache and TTL
src/content/        homepage detection, selectors, mounting the modal
src/components/     Preact: SearchModal, QueryBuilder, SetAutocomplete, useSets
src/lib/            pure helpers: query build/explain, set parsing + search
src/ui/             shadow-root mounting, theme detection, styles + tokens
tests/unit/         vitest + happy-dom
tests/e2e/smoke.mjs Playwright run against live scryfall.com
```

## Development

```sh
npm install
npm run dev              # Chrome, live reload
npm run dev:firefox
npm run build            # dist/chrome-mv3
npm run build:firefox    # dist/firefox-mv3
npm run typecheck
npm test                 # vitest
npm run test:e2e         # needs a build first; see below
```

The smoke run loads the built extension into Playwright's Chromium (Google
Chrome ≥ 137 ignores `--load-extension`) and drives the real homepage:

```sh
npx playwright install chromium
npm run build
npm run test:e2e         # HEADED=1 to watch it
```

Screenshots and `results.json` land in `tests/e2e/.state/`.

## Notes on the host page

A few things about scryfall.com shape the implementation, and all are easy to
trip over again:

- **Its CSP has `style-src` without `'unsafe-inline'`**, so `style` attributes
  on elements in the page are silently dropped. The shadow host is therefore
  laid out from a `:host` rule in `src/ui/styles.css`, not from a style
  attribute — and those declarations need `!important`, because WXT resets the
  host with `:host { all: initial !important }`. Positions set from script
  (`el.style.top = …`, Preact's `style={{…}}`) are CSSOM writes and do work.
- **It binds single-letter keyboard shortcuts on the document.** Keys typed in
  our shadow root reach it with the host as their target, so it takes them for
  shortcuts (one jumps to /advanced). The modal stops key events from leaving it.
- **Scryfall exposes no theme class.** Its homepage hero is dark for everyone,
  painted by a gradient on `div.homepage`, while `div.main` behind it is light.
  So `src/ui/theme.ts` reads the background actually painted behind the search
  form — colour or gradient — and picks dark or light by luminance.

The Scryfall API is called only from the background worker. Scryfall rejects
requests that send a generic User-Agent; `fetch()` cannot set that header, but
the browser supplies its own, which their API accepts.
