// Verified against live scryfall.com on 2026-09-18 (curl + DOM inspection).
export const SCRYFALL = {
  homeForm: 'form.homepage-form',
  homeInput: 'input#q[name="q"]',
} as const;

/** The builder only belongs on the homepage, under the big search box. */
export function isHomePage(url: URL): boolean {
  return url.pathname === '/' || url.pathname === '';
}
