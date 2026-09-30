<img src="assets/icon.png" alt="Yassir logo" width="128" align="right">

# Yassir

**Y**et **A**nother **S**cryfall **S**earch **I**nterface **R**efinement. The name is also Arabic: yassir (يُسْر or يَسِير) means "easy", "simple" or "convenient".

Yassir is a browser extension for Chrome and Firefox that turns the search box on [scryfall.com](https://scryfall.com) into a query builder. Focusing the search box opens a panel with fields for name, type, colors, mana value, rarity, sets, format, price and more. The query stays plain text you can edit: typing updates the form, the form rewrites only its own terms, and conditions the form can't show appear as removable pins.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev          # Chrome with live reload (dev:firefox for Firefox)
npm run build        # production build in dist/ (build:firefox, build:all)
npm run typecheck
npm test             # unit tests (Vitest)
npm run test:e2e     # smoke test on live scryfall.com
```

The e2e test loads `dist/chrome-mv3` into Playwright's Chromium, so run `npm run build` and `npx playwright install chromium` first. Set `HEADED=1` to watch it; screenshots go to `tests/e2e/.state/`.

## How it works

- The query text is the single source of truth. `src/lib/query-parse.ts` parses it, `readQuery` in `src/lib/query-sync.ts` turns it into form state, and `writeQuery` rewrites only the terms of the fields that changed.
- `src/lib/scryfall-syntax.ts` defines the form state and the terms each field writes. `src/lib/query-dictionary.ts` names the conditions shown as pins.
- The UI is Preact (`src/components`), mounted in a shadow root by `src/content/mount.ts`. The background worker (`src/background/sets.ts`) fetches the set list from the Scryfall API and caches it for a day.

## Contributing

- Keep `src/lib` free of DOM and browser APIs, and cover changes there with unit tests.
- Run `npm run typecheck` and `npm test` before opening a pull request, and `npm run test:e2e` when you change the UI.
- A few things about scryfall.com are easy to trip over:
  - Its CSP drops `style` attributes, so the shadow host is laid out by the `:host` rule in `src/ui/styles.css`. Styles set from script still work.
  - It binds single-letter keyboard shortcuts on the document, so the modal stops key events from leaving it.
  - It has no theme class. `src/ui/theme.ts` picks light or dark from the background painted behind the search box.

Yassir is not affiliated with or endorsed by Scryfall.
