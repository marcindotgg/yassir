import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  outDir: 'dist',
  modules: ['@wxt-dev/auto-icons'],
  vite: () => ({ plugins: [preact()] }),
  // Demo media is not needed to rebuild the extension, so it stays out of the Firefox sources zip.
  zip: { excludeSources: ['docs/**', 'artifacts/**'] },
  hooks: {
    // The full logo is unreadable at 16px, so the glyph-only icon replaces the one auto-icons generates.
    'build:done': (wxt) => copyFile('assets/icon-16.png', resolve(wxt.config.outDir, 'icons/16.png')),
  },
  manifest: ({ browser }) => ({
    name: 'Yassir – Query Builder for Scryfall',
    description: 'A form-driven query builder on scryfall.com.',
    permissions: ['storage'],
    // scryfall.com carries the content script; api.scryfall.com is fetched by
    // the background worker for the set list (see src/background/sets.ts).
    host_permissions: ['https://scryfall.com/*', 'https://api.scryfall.com/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'yassir@local', strict_min_version: '121.0' },
          },
        }
      : {}),
  }),
});
