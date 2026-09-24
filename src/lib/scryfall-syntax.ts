// Pure helpers behind the query builder: state -> query string. No DOM, unit-tested.

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

/** Builds a Scryfall query from the form state. Returns '' when nothing is set. */
export function buildQuery(state: QueryState): string {
  const parts: string[] = [];

  const name = state.name.trim();
  if (name) parts.push(/\s/.test(name) ? `name:${quote(name)}` : name);

  for (const word of splitTerms(state.text)) parts.push(`o:${quote(word)}`);
  for (const word of splitTerms(state.type)) parts.push(`t:${quote(word)}`);

  if (state.colorless) parts.push('c:c');
  else {
    const letters = COLORS.filter((c) => state.colors.includes(c)).join('').toLowerCase();
    if (letters) parts.push(`c<=${letters}`);
    // Any of the picked combinations: `(c=orzhov or c=izzet)`.
    parts.push(...orGroup(state.colorCombos.map((name) => `c=${name}`)));
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
