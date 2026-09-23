import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: '.',
  outDir: 'dist',
  modules: ['@wxt-dev/auto-icons'],
  vite: () => ({ plugins: [preact()] }),
  autoIcons: { baseIconPath: 'assets/icon.svg' },
  manifest: ({ browser }) => ({
    name: 'Scryfall Query Builder',
    description: 'A form-driven query builder, a query explainer and set-name autocomplete on scryfall.com.',
    permissions: ['storage'],
    // scryfall.com carries the content script; api.scryfall.com is fetched by
    // the background worker for the set list (see src/background/sets.ts).
    host_permissions: ['https://scryfall.com/*', 'https://api.scryfall.com/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'scryfall-query-builder@local', strict_min_version: '121.0' },
          },
        }
      : {}),
  }),
});
