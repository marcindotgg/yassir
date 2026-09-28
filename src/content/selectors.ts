export interface SearchBox {
  form: string;
  input: string;
  adornments?: string;
}

const HOMEPAGE_SEARCH: SearchBox = {
  form: 'form.homepage-form',
  input: 'input#q[name="q"]',
  adornments: 'a.homepage-logo svg',
};

const HEADER_SEARCH: SearchBox = {
  form: 'form.header-search',
  input: 'input#header-search-field[name="q"]',
};

export function searchBoxFor(url: URL): SearchBox {
  return url.pathname === '/' ? HOMEPAGE_SEARCH : HEADER_SEARCH;
}
