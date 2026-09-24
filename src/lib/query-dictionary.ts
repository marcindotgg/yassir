// What Scryfall's keywords mean, so a condition the form has no field for can
// still be shown by name ("Oracle tag: removal", "not Reprint") on a pin that
// removes it. No DOM, unit-tested.

import type { Expr, Op, Term } from './query-parse';
import { COLOR_COMBO_GROUPS } from './scryfall-syntax';

/**
 * Every keyword Scryfall accepts, under the name a pin shows for it. Each alias
 * was checked against the live API on 2026-09-24: an unknown keyword comes back
 * with an "Unknown keyword" warning (`n:` and `color_identity:` do; these don't).
 */
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

const LABELS = new Map(KEYWORDS.flatMap(([label, aliases]) => aliases.map((alias): [string, string] => [alias, label])));

/** Whether Scryfall knows `key`; it ignores a term whose keyword it doesn't. */
export const isKeyword = (key: string): boolean => LABELS.has(key.toLowerCase());

/** `is:` / `not:` values, named. Any other value still shows, as "Is: value". */
const FLAG_LABELS: Record<string, string> = {
  // Faces and layouts
  dfc: 'Double-faced',
  mdfc: 'Modal double-faced',
  transform: 'Transforming',
  split: 'Split card',
  flip: 'Flip card',
  meld: 'Meld card',
  leveler: 'Leveler',
  // What the card is
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
  // Printings
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
  // Commander and formats
  commander: 'Commander',
  brawler: 'Brawl commander',
  companion: 'Companion',
  partner: 'Partner',
  oathbreaker: 'Oathbreaker',
  duelcommander: 'Duel commander',
  reserved: 'Reserved List',
  gamechanger: 'Game Changer',
  // Land cycles
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
const COMBOS = new Set([...COLOR_COMBO_GROUPS.flatMap((g) => g.combos.map((c) => c.name)), 'silverquill', 'prismari', 'witherbloom', 'lorehold', 'quandrix']);
const COLOR_KEYS = new Set(['c', 'color', 'id', 'identity', 'ci', 'commander']);
const SET_KEYS = new Set(['s', 'e', 'set', 'edition', 'in']);
const OP_TEXT: Record<Op, string> = { ':': ': ', '=': ' = ', '!=': ' ≠ ', '<': ' < ', '<=': ' ≤ ', '>': ' > ', '>=': ' ≥ ' };

export interface Description {
  text: string;
  /** False when some keyword in it is one Scryfall doesn't know, and will ignore. */
  known: boolean;
}

export interface Names {
  /** Set code -> set name, from the Scryfall set list. */
  set?: (code: string) => string | undefined;
}

const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

function value(term: Term, names: Names): string {
  const v = term.value;
  if (!v) return '…';
  if (term.regex) return `/${v}/`;
  const lower = v.toLowerCase();
  if (COLOR_KEYS.has(term.key)) {
    if (COLOR_WORDS[lower]) return COLOR_WORDS[lower];
    if (COMBOS.has(lower)) return capitalize(lower);
    if (/^[wubrg]+$/.test(lower)) return lower.toUpperCase();
  }
  if (SET_KEYS.has(term.key)) {
    const name = names.set?.(lower);
    if (name) return name;
  }
  return /\s/.test(v) ? `“${v}”` : v;
}

/** Keywords whose value says it all: `is:foil` -> "Foil", `has:watermark` -> "Has watermark". */
const SPOKEN = new Set(['is', 'not', 'has', 'new', 'include']);

/** "Type: ", "Mana value ≥ " — what comes before a term's value. */
function lead(term: Term): Description {
  if (!term.key) return { text: term.exact ? 'Exact name: ' : 'Name: ', known: true };
  const label = LABELS.get(term.key);
  return { text: `${label ?? term.key}${OP_TEXT[term.op as Op]}`, known: label !== undefined };
}

/** One term, e.g. `-t:creature` -> "not Type: creature". */
function describeTerm(term: Term, names: Names): Description {
  if (SPOKEN.has(term.key) && term.op === ':' && term.value) {
    const v = term.value.toLowerCase();
    if (term.key !== 'is' && term.key !== 'not') return { text: `${term.negated ? 'not ' : ''}${capitalize(term.key)} ${v}`, known: true };
    // `-not:reprint` is a double negative: a reprint.
    return { text: `${(term.key === 'not') !== term.negated ? 'not ' : ''}${FLAG_LABELS[v] ?? `Is: ${v}`}`, known: true };
  }
  const head = lead(term);
  return { text: `${term.negated ? 'not ' : ''}${head.text}${value(term, names)}`, known: head.known };
}

/**
 * Names a condition for its pin. Alternatives on one keyword read as one:
 * `(t:goblin or t:elf)` -> "Type: goblin or elf".
 */
export function describe(node: Expr, names: Names = {}): Description {
  switch (node.kind) {
    case 'term':
      return describeTerm(node, names);
    case 'stray':
      return { text: 'Unmatched “)”', known: false };
    case 'group': {
      if (!node.body) return { text: `${node.negated ? 'not ' : ''}( )`, known: true };
      const inner = describe(node.body, names);
      return { text: node.negated ? `not (${inner.text})` : inner.text, known: inner.known };
    }
    case 'and':
    case 'or': {
      const join = ` ${node.kind} `;
      const terms = node.items.every((i): i is Term => i.kind === 'term') ? (node.items as Term[]) : [];
      const first = terms[0];
      const alike = (t: Term) => !t.negated && t.key === first?.key && t.op === first.op && t.exact === first.exact;
      if (first && !SPOKEN.has(first.key) && terms.every(alike)) {
        const head = lead(first);
        return { text: head.text + terms.map((t) => value(t, names)).join(join), known: head.known };
      }
      const parts = node.items.map((i) => {
        const d = describe(i, names);
        // A nested list of the other kind keeps its brackets: "a or (b and c)".
        return { ...d, text: i.kind === 'and' || i.kind === 'or' ? `(${d.text})` : d.text };
      });
      return { text: parts.map((p) => p.text).join(join), known: parts.every((p) => p.known) };
    }
  }
}
