import type { Expr, Group, List, Op, Term } from './query-parse';
import { COLOR_COMBO_GROUPS } from './scryfall-syntax';

// An alias Scryfall doesn't know comes back from api.scryfall.com with an "Unknown keyword" warning.
const KEYWORDS: readonly (readonly [label: string, aliases: readonly string[]])[] = [
  ['Name', ['name']],
  ['Colors', ['c', 'color']],
  ['Color identity', ['id', 'identity', 'ci', 'commander']],
  ['Has', ['has']],
  ['Type', ['t', 'type']],
  ['Rules text', ['o', 'oracle']],
  ['Full rules text', ['fo', 'fulloracle']],
  ['Keyword', ['kw', 'keyword']],
  ['Mana cost', ['m', 'mana']],
  ['Mana value', ['mv', 'cmc', 'manavalue']],
  ['Devotion', ['devotion']],
  ['Produces', ['produces']],
  ['Power', ['pow', 'power']],
  ['Toughness', ['tou', 'toughness']],
  ['Power + toughness', ['pt', 'powtou']],
  ['Loyalty', ['loy', 'loyalty']],
  ['Defense', ['def', 'defense']],
  ['Hand size', ['hand']],
  ['Starting life', ['life']],
  ['Layout', ['layout']],
  ['Is', ['is']],
  ['Is not', ['not']],
  ['Include', ['include']],
  ['Rarity', ['r', 'rarity']],
  ['New', ['new']],
  ['Printed in', ['in']],
  ['Set', ['s', 'e', 'set', 'edition']],
  ['Set type', ['st', 'settype']],
  ['Collector number', ['cn', 'number']],
  ['Block', ['b', 'block']],
  ['Set group', ['g', 'group']],
  ['Cube', ['cube']],
  ['Legal in', ['f', 'format', 'legal']],
  ['Banned in', ['banned']],
  ['Restricted in', ['restricted']],
  ['Price (USD)', ['usd']],
  ['Price (EUR)', ['eur']],
  ['Price (tix)', ['tix']],
  ['Cheapest in', ['cheapest']],
  ['EDHREC rank', ['edhrec', 'edhrecrank']],
  ['Penny rank', ['pennyrank']],
  ['Artist', ['a', 'artist']],
  ['Artists', ['artists']],
  ['Illustrations', ['illustrations']],
  ['Flavor text', ['ft', 'flavor']],
  ['Lore', ['lore']],
  ['Watermark', ['wm', 'watermark']],
  ['Border', ['border']],
  ['Frame', ['frame']],
  ['Security stamp', ['stamp']],
  ['Game', ['game']],
  ['Year', ['year']],
  ['Release date', ['date']],
  ['Language', ['lang', 'language']],
  ['Oracle tag', ['otag', 'oracletag', 'function']],
  ['Art tag', ['atag', 'arttag', 'art']],
  ['Prints', ['prints']],
  ['Paper prints', ['paperprints']],
  ['Sets', ['sets']],
  ['Paper sets', ['papersets']],
  ['Oracle ID', ['oracleid']],
  ['Sort by', ['order']],
  ['Sort direction', ['direction']],
  ['Unique', ['unique']],
  ['Prefer', ['prefer']],
  ['Display', ['display']],
];

const KEYWORD_LABELS = new Map(KEYWORDS.flatMap(([label, aliases]) => aliases.map((alias) => [alias, label] as const)));

const FLAG_LABELS: Record<string, string> = {
  dfc: 'Double-faced',
  mdfc: 'Modal double-faced',
  transform: 'Transforming',
  split: 'Split card',
  flip: 'Flip card',
  meld: 'Meld card',
  leveler: 'Leveler',
  spell: 'Spell',
  permanent: 'Permanent',
  historic: 'Historic',
  modal: 'Modal',
  vanilla: 'Vanilla',
  frenchvanilla: 'French vanilla',
  bear: 'Bear (2/2 for 2)',
  party: 'Party member',
  outlaw: 'Outlaw',
  hybrid: 'Hybrid mana',
  phyrexian: 'Phyrexian mana',
  funny: 'Funny (Un-card)',
  reprint: 'Reprint',
  firstprint: 'First printing',
  unique: 'Single printing',
  promo: 'Promo',
  digital: 'Digital',
  foil: 'Foil',
  nonfoil: 'Non-foil',
  etched: 'Etched foil',
  glossy: 'Glossy',
  hires: 'High-res scan',
  fullart: 'Full art',
  showcase: 'Showcase',
  extended: 'Extended art',
  borderless: 'Borderless',
  booster: 'In boosters',
  datestamped: 'Date-stamped',
  default: 'Default printing',
  atypical: 'Atypical printing',
  alchemy: 'Alchemy',
  universesbeyond: 'Universes Beyond',
  masterpiece: 'Masterpiece',
  colorshifted: 'Colorshifted',
  spotlight: 'Story spotlight',
  commander: 'Commander',
  brawler: 'Brawl commander',
  companion: 'Companion',
  partner: 'Partner',
  oathbreaker: 'Oathbreaker',
  duelcommander: 'Duel commander',
  reserved: 'Reserved List',
  gamechanger: 'Game Changer',
  dual: 'Original dual',
  fetchland: 'Fetch land',
  shockland: 'Shock land',
  checkland: 'Check land',
  painland: 'Pain land',
  fastland: 'Fast land',
  slowland: 'Slow land',
  bounceland: 'Bounce land',
  filterland: 'Filter land',
  pathway: 'Pathway',
  scryland: 'Scry land',
  triome: 'Triome',
  battleland: 'Battle land',
  bikeland: 'Cycling land',
  canopyland: 'Canopy land',
  gainland: 'Gain land',
  storageland: 'Storage land',
  creatureland: 'Creature land',
  manland: 'Creature land',
};

const COLOR_WORDS: Record<string, string> = { c: 'colorless', colorless: 'colorless', m: 'multicolor', multicolor: 'multicolor' };
const COLOR_NICKNAMES = new Set([...COLOR_COMBO_GROUPS.flatMap((group) => group.combos.map((combo) => combo.name)), 'silverquill', 'prismari', 'witherbloom', 'lorehold', 'quandrix']);
const COLOR_KEYS = new Set(['c', 'color', 'id', 'identity', 'ci', 'commander']);
const SET_KEYS = new Set(['s', 'e', 'set', 'edition', 'in']);
const PHRASE_KEYS = new Set(['is', 'not', 'has', 'new', 'include']);
const OPERATOR_TEXT: Record<Op, string> = { ':': ': ', '=': ' = ', '!=': ' ≠ ', '<': ' < ', '<=': ' ≤ ', '>': ' > ', '>=': ' ≥ ' };

export interface Description {
  text: string;
  known: boolean;
}

export type SetNameLookup = (code: string) => string | undefined;

export function describeNode(node: Expr, setName?: SetNameLookup): Description {
  switch (node.kind) {
    case 'term':
      return describeTerm(node, setName);
    case 'stray':
      return { text: 'Unmatched “)”', known: false };
    case 'group':
      return describeGroup(node, setName);
    case 'and':
    case 'or':
      return describeList(node, setName);
  }
}

function describeTerm(term: Term, setName?: SetNameLookup): Description {
  if (PHRASE_KEYS.has(term.key) && term.op === ':' && term.value) return { text: describePhrase(term), known: true };
  const key = describeKey(term);
  return { text: `${term.negated ? 'not ' : ''}${key.text}${describeValue(term, setName)}`, known: key.known };
}

function describePhrase(term: Term): string {
  const value = term.value.toLowerCase();
  if (term.key !== 'is' && term.key !== 'not') return `${term.negated ? 'not ' : ''}${capitalize(term.key)} ${value}`;
  const negated = (term.key === 'not') !== term.negated;
  return `${negated ? 'not ' : ''}${FLAG_LABELS[value] ?? `Is: ${value}`}`;
}

function describeGroup(group: Group, setName?: SetNameLookup): Description {
  if (!group.body) return { text: `${group.negated ? 'not ' : ''}( )`, known: true };
  const inner = describeNode(group.body, setName);
  return { text: group.negated ? `not (${inner.text})` : inner.text, known: inner.known };
}

function describeList(list: List, setName?: SetNameLookup): Description {
  const joiner = ` ${list.kind} `;
  const sameKey = sameKeyTerms(list.items);
  if (sameKey) {
    const key = describeKey(sameKey[0] as Term);
    return { text: key.text + sameKey.map((term) => describeValue(term, setName)).join(joiner), known: key.known };
  }
  const parts = list.items.map((item) => {
    const description = describeNode(item, setName);
    const nested = item.kind === 'and' || item.kind === 'or';
    return { ...description, text: nested ? `(${description.text})` : description.text };
  });
  return { text: parts.map((part) => part.text).join(joiner), known: parts.every((part) => part.known) };
}

function sameKeyTerms(items: Expr[]): Term[] | null {
  const [first] = items;
  if (first?.kind !== 'term' || PHRASE_KEYS.has(first.key)) return null;
  const isAlike = (item: Expr) => item.kind === 'term' && !item.negated && item.key === first.key && item.op === first.op && item.exact === first.exact;
  return items.every(isAlike) ? (items as Term[]) : null;
}

function describeKey(term: Term): Description {
  if (!term.key) return { text: term.exact ? 'Exact name: ' : 'Name: ', known: true };
  const label = KEYWORD_LABELS.get(term.key);
  return { text: `${label ?? term.key}${OPERATOR_TEXT[term.op as Op]}`, known: label !== undefined };
}

function describeValue(term: Term, setName?: SetNameLookup): string {
  const { value } = term;
  if (!value) return '…';
  if (term.regex) return `/${value}/`;
  const lower = value.toLowerCase();
  if (COLOR_KEYS.has(term.key)) {
    if (COLOR_WORDS[lower]) return COLOR_WORDS[lower];
    if (COLOR_NICKNAMES.has(lower)) return capitalize(lower);
    if (/^[wubrg]+$/.test(lower)) return lower.toUpperCase();
  }
  const set = SET_KEYS.has(term.key) ? setName?.(lower) : undefined;
  if (set) return set;
  return /\s/.test(value) ? `“${value}”` : value;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
