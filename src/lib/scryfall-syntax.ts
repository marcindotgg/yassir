// Pure helpers behind the query builder: the form's state and the terms each of
// its fields writes into the query. No DOM, unit-tested.

export interface QueryState {
  name: string;
  text: string;
  type: string;
  colors: string[];
  /** Names from COLOR_COMBOS (`izzet`, `jund`…). Each becomes its own term, so they AND together. */
  colorCombos: string[];
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
  /** Scryfall Tagger's oracle tags (`removal`, `mana-rock`); each word is its own `otag:` term. */
  otag: string;
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
  colorCombos: [],
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
  otag: '',
  year: '',
  flags: [],
  order: '',
  direction: 'auto',
};

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;

export interface ColorCombo {
  /** The nickname Scryfall accepts as a color value: `c>=izzet`. */
  name: string;
  /** Its colors in WUBRG order, upper-case. */
  colors: string;
}

/** Scryfall's named color combinations, in the order the builder lists them. */
export const COLOR_COMBO_GROUPS: readonly { label: string; combos: readonly ColorCombo[] }[] = [
  {
    label: 'Guilds',
    combos: [
      { name: 'azorius', colors: 'WU' },
      { name: 'dimir', colors: 'UB' },
      { name: 'rakdos', colors: 'BR' },
      { name: 'gruul', colors: 'RG' },
      { name: 'selesnya', colors: 'GW' },
      { name: 'orzhov', colors: 'WB' },
      { name: 'izzet', colors: 'UR' },
      { name: 'golgari', colors: 'BG' },
      { name: 'boros', colors: 'RW' },
      { name: 'simic', colors: 'GU' },
    ],
  },
  {
    label: 'Shards',
    combos: [
      { name: 'bant', colors: 'GWU' },
      { name: 'esper', colors: 'WUB' },
      { name: 'grixis', colors: 'UBR' },
      { name: 'jund', colors: 'BRG' },
      { name: 'naya', colors: 'RGW' },
    ],
  },
  {
    label: 'Wedges',
    combos: [
      { name: 'abzan', colors: 'WBG' },
      { name: 'jeskai', colors: 'URW' },
      { name: 'sultai', colors: 'BGU' },
      { name: 'mardu', colors: 'RWB' },
      { name: 'temur', colors: 'GUR' },
    ],
  },
  {
    label: 'Four colors',
    combos: [
      { name: 'chaos', colors: 'UBRG' },
      { name: 'aggression', colors: 'WBRG' },
      { name: 'altruism', colors: 'WURG' },
      { name: 'growth', colors: 'WUBG' },
      { name: 'artifice', colors: 'WUBR' },
    ],
  },
  {
    label: 'Five colors',
    combos: [{ name: 'rainbow', colors: 'WUBRG' }],
  },
];

export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper', 'brawl', 'alchemy', 'historic'] as const;
export const FLAGS = ['foil', 'nonfoil', 'promo', 'reprint', 'firstprint', 'digital', 'fullart', 'showcase', 'extended', 'borderless', 'commander', 'reserved'] as const;
export const ORDERS = ['name', 'set', 'released', 'rarity', 'color', 'usd', 'eur', 'cmc', 'power', 'toughness', 'edhrec', 'artist'] as const;

const quote = (value: string): string => {
  const v = value.trim();
  if (!v) return '';
  return /[\s"':()]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
};

/** A word of the rules text or type field; `/…/` goes in as a regex, not quoted. */
const textTerm = (key: string, word: string): string => (/^\/.+\/$/.test(word) ? `${key}:${word}` : `${key}:${quote(word)}`);

/** A lone word goes into the query bare, the way people type it; anything the parser would take for syntax gets `name:"…"`. */
const BARE_NAME = /^[^\s"():<>=!\/-][^\s"():<>=!]*$/;

const NUMBER = /^\d+(\.\d+)?$/;

/** The form's fields, in the order buildQuery lays them out. */
export const FIELDS = ['name', 'text', 'type', 'colors', 'manaValue', 'rarity', 'sets', 'format', 'price', 'power', 'toughness', 'artist', 'otag', 'year', 'flags', 'order', 'direction'] as const;
export type FieldId = (typeof FIELDS)[number];

/**
 * The terms each field writes, one per condition the query holds on its own
 * (every `o:` word, every `is:` flag), so the box can be edited term by term.
 */
export const FIELD_TERMS: Record<FieldId, (state: QueryState) => string[]> = {
  name: (s) => {
    const name = s.name.trim();
    if (!name) return [];
    return [BARE_NAME.test(name) && !/^(or|and)$/i.test(name) ? name : `name:${quote(name)}`];
  },
  text: (s) => splitTerms(s.text).map((word) => textTerm('o', word)),
  type: (s) => splitTerms(s.type).map((word) => textTerm('t', word)),
  colors: (s) => {
    if (s.colorless) return ['c=c'];
    const letters = COLORS.filter((c) => s.colors.includes(c)).join('').toLowerCase();
    // One color exactly: `c=r`; several at most, colorless left out: `(c<=ur -c:c)`.
    const colors = letters.length > 1 ? [`(c<=${letters} -c:c)`] : letters ? [`c=${letters}`] : [];
    // Any of the picked combinations: `(c=orzhov or c=izzet)`.
    return [...colors, ...orGroup(s.colorCombos.map((name) => `c=${name}`))];
  },
  manaValue: (s) => (NUMBER.test(s.manaValue.trim()) ? [`mv${s.manaValueOp}${s.manaValue.trim()}`] : []),
  rarity: (s) => orGroup(s.rarity.map((r) => `r:${r}`)),
  sets: (s) => orGroup(s.sets.map((code) => `s:${code.trim().toLowerCase()}`)),
  format: (s) => (s.format ? [`f:${s.format}`] : []),
  price: (s) => (NUMBER.test(s.priceMax.trim()) ? [`${s.priceCurrency}<=${s.priceMax.trim()}`] : []),
  power: (s) => compare('pow', s.power),
  toughness: (s) => compare('tou', s.toughness),
  artist: (s) => (s.artist.trim() ? [`a:${quote(s.artist)}`] : []),
  otag: (s) => splitTerms(s.otag).map((tag) => `otag:${quote(tag)}`),
  year: (s) => compare('year', s.year),
  flags: (s) => s.flags.map((flag) => `is:${flag}`),
  order: (s) => (s.order ? [`order:${s.order}`] : []),
  direction: (s) => (s.direction !== 'auto' ? [`direction:${s.direction}`] : []),
};

/** Builds a Scryfall query from the whole form. Returns '' when nothing is set. */
export function buildQuery(state: QueryState): string {
  return FIELDS.flatMap((field) => FIELD_TERMS[field](state)).join(' ');
}

export type ColorSelection = Pick<QueryState, 'colors' | 'colorless' | 'colorCombos'>;

export type ColorOption = { kind: 'color'; value: (typeof COLORS)[number] } | { kind: 'colorless' } | { kind: 'combo'; value: string };

/**
 * Toggles one option of the colors multiselect. The three kinds exclude each
 * other: picking colorless or a combination clears the single colors, and
 * picking a single color clears colorless and the combinations. Within a kind
 * the picks accumulate.
 */
export function toggleColorOption(sel: ColorSelection, option: ColorOption): ColorSelection {
  const none: ColorSelection = { colors: [], colorless: false, colorCombos: [] };
  const flip = <T>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  switch (option.kind) {
    case 'color':
      return { ...none, colors: flip(sel.colors, option.value) };
    case 'colorless':
      return { ...none, colorless: !sel.colorless };
    case 'combo':
      return { ...none, colorCombos: flip(sel.colorCombos, option.value) };
  }
}

/** [] | ['a'] | ['(a or b)'] — Scryfall ANDs bare terms, so alternatives need the group. */
function orGroup(terms: string[]): string[] {
  if (terms.length === 0) return [];
  if (terms.length === 1) return [terms[0] as string];
  return [`(${terms.join(' or ')})`];
}

// "3", ">=3", "<2" -> "pow=3", "pow>=3", "pow<2"; a lone operator, still being typed, writes nothing.
function compare(key: string, raw: string): string[] {
  const m = raw.trim().match(/^(<=|>=|!=|=|<|>)?\s*(.*)$/);
  return m?.[2] ? [`${key}${m[1] ?? '='}${m[2]}`] : [];
}

/** `draw "a card"` -> ['draw', 'a card']. */
function splitTerms(raw: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push((m[1] ?? m[2] ?? '').trim());
  return out.filter(Boolean);
}
