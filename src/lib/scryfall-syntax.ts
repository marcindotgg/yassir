export interface QueryState {
  name: string;
  rulesText: string;
  type: string;
  colors: string[];
  colorCombos: string[];
  colorless: boolean;
  manaValue: string;
  rarity: string[];
  sets: string[];
  format: string;
  priceMax: string;
  priceCurrency: 'eur' | 'usd';
  power: string;
  toughness: string;
  artist: string;
  otag: string;
  year: string;
  flags: string[];
  order: string;
  direction: 'auto' | 'asc' | 'desc';
}

export const EMPTY_QUERY: QueryState = {
  name: '',
  rulesText: '',
  type: '',
  colors: [],
  colorCombos: [],
  colorless: false,
  manaValue: '',
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

interface ColorCombo {
  name: string;
  colors: string;
}

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

export const RARITIES = ['common', 'uncommon', 'rare', 'mythic', 'special'] as const;
export const FORMATS = [
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'commander',
  'pauper',
  'brawl',
  'alchemy',
  'historic',
] as const;
export const FLAGS = [
  'foil',
  'nonfoil',
  'promo',
  'reprint',
  'firstprint',
  'digital',
  'fullart',
  'showcase',
  'extended',
  'borderless',
  'commander',
  'reserved',
] as const;
export const ORDERS = [
  'name',
  'set',
  'released',
  'rarity',
  'color',
  'usd',
  'eur',
  'cmc',
  'power',
  'toughness',
  'edhrec',
  'artist',
] as const;

export const DECIMAL = /^\d+(\.\d+)?$/;
const BARE_NAME = /^[^\s"():<>=!/-][^\s"():<>=!]*$/;

export const FIELDS = [
  'name',
  'rulesText',
  'type',
  'colors',
  'manaValue',
  'rarity',
  'sets',
  'format',
  'price',
  'power',
  'toughness',
  'artist',
  'otag',
  'year',
  'flags',
  'order',
  'direction',
] as const;
export type FieldId = (typeof FIELDS)[number];

/** One term per condition, so the query can be edited term by term. */
export const FIELD_TERMS: Record<FieldId, (state: QueryState) => string[]> = {
  name: (s) => nameTerms(s.name),
  rulesText: (s) => splitWords(s.rulesText).map((word) => wordTerm('o', word)),
  type: (s) => splitWords(s.type).map((word) => wordTerm('t', word)),
  colors: colorTerms,
  manaValue: (s) => comparisonTerms('mv', s.manaValue),
  rarity: (s) => orGroup(s.rarity.map((rarity) => `r:${rarity}`)),
  sets: (s) => orGroup(s.sets.map((code) => `s:${code.trim().toLowerCase()}`)),
  format: (s) => (s.format ? [`f:${s.format}`] : []),
  price: (s) => (DECIMAL.test(s.priceMax.trim()) ? [`${s.priceCurrency}<=${s.priceMax.trim()}`] : []),
  power: (s) => comparisonTerms('pow', s.power),
  toughness: (s) => comparisonTerms('tou', s.toughness),
  artist: (s) => (s.artist.trim() ? [`a:${quoteIfNeeded(s.artist)}`] : []),
  otag: (s) => splitWords(s.otag).map((tag) => `otag:${quoteIfNeeded(tag)}`),
  year: (s) => comparisonTerms('year', s.year),
  flags: (s) => s.flags.map((flag) => `is:${flag}`),
  order: (s) => (s.order ? [`order:${s.order}`] : []),
  direction: (s) => (s.direction === 'auto' ? [] : [`direction:${s.direction}`]),
};

export function buildQuery(state: QueryState): string {
  return FIELDS.flatMap((field) => FIELD_TERMS[field](state)).join(' ');
}

export type ColorSelection = Pick<QueryState, 'colors' | 'colorless' | 'colorCombos'>;

export type ColorOption =
  | { kind: 'color'; value: (typeof COLORS)[number] }
  | { kind: 'colorless' }
  | { kind: 'combo'; value: string };

export function toggleColorOption(selection: ColorSelection, option: ColorOption): ColorSelection {
  const none: ColorSelection = { colors: [], colorless: false, colorCombos: [] };
  switch (option.kind) {
    case 'color':
      return { ...none, colors: toggleItem(selection.colors, option.value) };
    case 'colorless':
      return { ...none, colorless: !selection.colorless };
    case 'combo':
      return { ...none, colorCombos: toggleItem(selection.colorCombos, option.value) };
  }
}

export function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((other) => other !== item) : [...list, item];
}

function quoteIfNeeded(value: string): string {
  const trimmed = value.trim();
  return /[\s"':()]/.test(trimmed) ? `"${trimmed.replace(/"/g, '\\"')}"` : trimmed;
}

function nameTerms(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const canStandAlone = BARE_NAME.test(trimmed) && !/^(or|and)$/i.test(trimmed);
  return [canStandAlone ? trimmed : `name:${quoteIfNeeded(trimmed)}`];
}

function wordTerm(key: string, word: string): string {
  const isRegex = /^\/.+\/$/.test(word);
  return `${key}:${isRegex ? word : quoteIfNeeded(word)}`;
}

function colorTerms({ colors, colorless, colorCombos }: QueryState): string[] {
  if (colorless) return ['c=c'];
  return [...singleColorTerms(colors), ...orGroup(colorCombos.map((combo) => `c=${combo}`))];
}

function singleColorTerms(colors: string[]): string[] {
  const letters = COLORS.filter((color) => colors.includes(color))
    .join('')
    .toLowerCase();
  if (!letters) return [];
  if (letters.length === 1) return [`c=${letters}`];
  return [`(c<=${letters} -c:c)`];
}

function orGroup(terms: string[]): string[] {
  return terms.length > 1 ? [`(${terms.join(' or ')})`] : terms;
}

function comparisonTerms(key: string, input: string): string[] {
  const [, operator = '=', value] = input.trim().match(/^(<=|>=|!=|=|<|>)?\s*(.*)$/) ?? [];
  return value ? [`${key}${operator}${value}`] : [];
}

function splitWords(input: string): string[] {
  return [...input.matchAll(/"([^"]+)"|(\S+)/g)].map((match) => (match[1] ?? match[2] ?? '').trim()).filter(Boolean);
}
