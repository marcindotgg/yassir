// Verified against live scryfall.com on 2026-09-18 (curl + DOM inspection); the
// header search on 2026-09-23.
export const SCRYFALL = {
  homeForm: 'form.homepage-form',
  homeInput: 'input#q[name="q"]',
  /** Drawn over the left end of the search box; the modal copies it. */
  homeLogo: 'a.homepage-logo svg',
  /** Every other page (search results, cards, sets…) has this one in the header. */
  headerForm: 'form.header-search',
  headerInput: 'input#header-search-field[name="q"]',
} as const;

export interface SearchBox {
  form: string;
  input: string;
  /** Things drawn over the box that the modal has to copy along. */
  adornments?: string;
}

/** The big box on the homepage, the header box everywhere else. */
export function searchBoxFor(url: URL): SearchBox {
  return isHomePage(url)
    ? { form: SCRYFALL.homeForm, input: SCRYFALL.homeInput, adornments: SCRYFALL.homeLogo }
    : { form: SCRYFALL.headerForm, input: SCRYFALL.headerInput };
}

export function isHomePage(url: URL): boolean {
  return url.pathname === '/' || url.pathname === '';
}
