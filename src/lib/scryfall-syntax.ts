// Pure helpers behind the query builder: state -> query string, and a small
// explainer for the most common operators. No DOM, unit-tested.

export type ColorMode = 'exact' | 'atMost' | 'atLeast' | 'identity';

export interface QueryState {
  name: string;
  text: string;
  type: string;
  colors: string[];
  colorMode: ColorMode;
  colorless: boolean;
  manaValue: string;
  manaValueOp: '=' | '<=' | '>=' | '<' | '>';
  rarity: string[];
  /** Set codes, lower-case, as picked in the autocomplete. */
  sets: string[];
  format: string;
  priceMax: string;
  priceCurrency: 'eur' | 'usd';
  power: string;
  toughness: string;
  artist: string;
  year: string;
  flags: string[];
  order: string;
  direction: 'auto' | 'asc' | 'desc';
}

export const EMPTY_QUERY: QueryState = {
  name: '',
  text: '',
  type: '',
  colors: [],
  colorMode: 'atMost',
  colorless: false,
  manaValue: '',
  manaValueOp: '=',
  rarity: [],
  sets: [],
  format: '',
  priceMax: '',
  priceCurrency: 'eur',
  power: '',
  toughness: '',
  artist: '',
  year: '',
  flags: [],
  order: '',
  direction: 'auto',
};

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper', 'brawl', 'alchemy', 'historic'] as const;
export const FLAGS = ['foil', 'nonfoil', 'promo', 'reprint', 'firstprint', 'digital', 'fullart', 'showcase', 'extended', 'borderless', 'commander', 'reserved'] as const;
export const ORDERS = ['name', 'set', 'released', 'rarity', 'color', 'usd', 'eur', 'cmc', 'power', 'toughness', 'edhrec', 'artist'] as const;

const quote = (value: string): string => {
  const v = value.trim();
  if (!v) return '';
  return /[\s"':()]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
};

/** Builds a Scryfall query from the form state. Returns '' when nothing is set. */
export function buildQuery(state: QueryState): string {
  const parts: string[] = [];

  const name = state.name.trim();
  if (name) parts.push(/\s/.test(name) ? `name:${quote(name)}` : name);

  for (const word of splitTerms(state.text)) parts.push(`o:${quote(word)}`);
  for (const word of splitTerms(state.type)) parts.push(`t:${quote(word)}`);

  if (state.colorless) parts.push('c:c');
  else if (state.colors.length) {
    const letters = COLORS.filter((c) => state.colors.includes(c)).join('').toLowerCase();
    const op = { exact: 'c=', atMost: 'c<=', atLeast: 'c>=', identity: 'id<=' }[state.colorMode];
    parts.push(op + letters);
  }

  if (state.manaValue.trim() !== '' && /^\d+(\.\d+)?$/.test(state.manaValue.trim())) {
    parts.push(`mv${state.manaValueOp}${state.manaValue.trim()}`);
  }

  parts.push(...orGroup(state.rarity.map((r) => `r:${r}`)));
  parts.push(...orGroup(state.sets.map((s) => `s:${s.trim().toLowerCase()}`)));

  if (state.format) parts.push(`f:${state.format}`);

  if (state.priceMax.trim() && /^\d+(\.\d+)?$/.test(state.priceMax.trim())) {
    parts.push(`${state.priceCurrency}<=${state.priceMax.trim()}`);
  }

  if (state.power.trim()) parts.push(`pow${normalizeCompare(state.power)}`);
  if (state.toughness.trim()) parts.push(`tou${normalizeCompare(state.toughness)}`);
  if (state.artist.trim()) parts.push(`a:${quote(state.artist)}`);
  if (state.year.trim()) parts.push(`year${normalizeCompare(state.year)}`);

  for (const flag of state.flags) parts.push(`is:${flag}`);

  if (state.order) {
    parts.push(`order:${state.order}`);
    if (state.direction !== 'auto') parts.push(`direction:${state.direction}`);
  }

  return parts.join(' ');
}

/** [] | ['a'] | ['(a or b)'] — Scryfall ANDs bare terms, so alternatives need the group. */
function orGroup(terms: string[]): string[] {
  if (terms.length === 0) return [];
  if (terms.length === 1) return [terms[0] as string];
  return [`(${terms.join(' or ')})`];
}

// "3", ">=3", "<2" -> "=3", ">=3", "<2"
function normalizeCompare(raw: string): string {
  const v = raw.trim();
  const m = v.match(/^(<=|>=|=|<|>|!=)?\s*(.+)$/);
  if (!m) return `=${v}`;
  return `${m[1] ?? '='}${m[2]}`;
}

function splitTerms(raw: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push((m[1] ?? m[2] ?? '').trim());
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Explainer

const COLOR_NAMES: Record<string, string> = { w: 'white', u: 'blue', b: 'black', r: 'red', g: 'green', c: 'colorless', m: 'multicolor' };
const SET_KEYS = new Set(['s', 'e', 'set', 'edition']);
const KEYWORD_LABELS: Record<string, string> = {
  o: 'rules text contains',
  oracle: 'rules text contains',
  t: 'type line contains',
  type: 'type line contains',
  name: 'name contains',
  s: 'set is',
  set: 'set is',
  e: 'set is',
  edition: 'set is',
  f: 'legal in',
  format: 'legal in',
  r: 'rarity is',
  rarity: 'rarity is',
  a: 'artist is',
  artist: 'artist is',
  kw: 'has keyword',
  keyword: 'has keyword',
  is: 'is',
  not: 'is not',
  order: 'sort by',
  direction: 'sort direction',
  lang: 'language is',
  year: 'released in year',
  cn: 'collector number',
  number: 'collector number',
  border: 'border is',
  frame: 'frame is',
  game: 'available in',
  unique: 'show unique',
  banned: 'banned in',
  restricted: 'restricted in',
  st: 'set type is',
  wm: 'watermark is',
  fo: 'flavor text contains',
  ft: 'flavor text contains',
  b: 'block is',
  block: 'block is',
  in: 'printed in',
  cube: 'in cube',
  prefer: 'prefer printings',
  new: 'new to this printing',
};
const NUMERIC_LABELS: Record<string, string> = {
  mv: 'mana value',
  cmc: 'mana value',
  manavalue: 'mana value',
  pow: 'power',
  power: 'power',
  tou: 'toughness',
  toughness: 'toughness',
  loy: 'loyalty',
  loyalty: 'loyalty',
  usd: 'price (USD)',
  eur: 'price (EUR)',
  tix: 'price (MTGO tix)',
  c: 'colors',
  color: 'colors',
  id: 'color identity',
  identity: 'color identity',
  devotion: 'devotion',
};
const OP_WORDS: Record<string, string> = { '=': 'exactly', ':': 'includes', '<=': 'at most', '>=': 'at least', '<': 'less than', '>': 'more than', '!=': 'not' };

export interface Explanation {
  token: string;
  text: string;
  known: boolean;
}

/**
 * Explains a Scryfall query token by token. Unknown tokens are flagged, never
 * dropped. `setNames` (code -> name, from the Scryfall set list) turns `s:mh3`
 * into “set is Modern Horizons 3 (mh3)”; without it the code is shown as typed.
 */
export function explainQuery(query: string, setNames?: ReadonlyMap<string, string>): Explanation[] {
  const tokens = tokenize(query);
  return tokens.map((token) => {
    let negated = false;
    let t = token;
    if (t.startsWith('-')) {
      negated = true;
      t = t.slice(1);
    }
    const lower = t.toLowerCase();
    if (lower === 'or') return { token, text: 'OR — either side matches', known: true };
    if (lower === 'and') return { token, text: 'AND', known: true };
    if (t.startsWith('(') || t.endsWith(')')) return { token, text: 'grouping parentheses', known: true };

    const m = t.match(/^([a-zA-Z]+)(<=|>=|!=|=|<|>|:)(.+)$/);
    if (!m) {
      const plain = t.replace(/^"|"$/g, '');
      return { token, text: `${negated ? 'name does not contain' : 'name contains'} “${plain}”`, known: true };
    }
    const key = (m[1] as string).toLowerCase();
    const op = m[2] as string;
    const value = (m[3] as string).replace(/^"|"$/g, '');
    const not = negated ? 'NOT: ' : '';

    if (key === 'c' || key === 'color' || key === 'id' || key === 'identity') {
      const which = key === 'c' || key === 'color' ? 'colors' : 'color identity';
      const named = value
        .toLowerCase()
        .split('')
        .map((l) => COLOR_NAMES[l] ?? l)
        .join(' + ');
      const named2 = COLOR_NAMES[value.toLowerCase()] ?? named;
      return { token, text: `${not}${which} ${OP_WORDS[op] ?? op} ${named2}`, known: true };
    }
    if (SET_KEYS.has(key)) {
      const name = setNames?.get(value.toLowerCase());
      return { token, text: `${not}set is ${name ? `${name} (${value.toLowerCase()})` : `“${value}”`}`, known: true };
    }
    if (key in NUMERIC_LABELS) {
      return { token, text: `${not}${NUMERIC_LABELS[key]} ${OP_WORDS[op] ?? op} ${value}`, known: true };
    }
    if (key in KEYWORD_LABELS) {
      return { token, text: `${not}${KEYWORD_LABELS[key]} “${value}”`, known: true };
    }
    return { token, text: `${not}unknown keyword “${key}”`, known: false };
  });
}

function tokenize(query: string): string[] {
  const out: string[] = [];
  const re = /-?[a-zA-Z]+(?:<=|>=|!=|=|<|>|:)"[^"]*"|-?"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) out.push(m[0]);
  return out;
}
