// The query in the box is the one source of truth; the form is a reading of it.
// readQuery says what each field shows and which conditions no field can;
// writeQuery puts a changed field back, term by term, where it stood, leaving
// the rest of the text alone. No DOM, unit-tested.

import { parseQuery, topLevel, type Expr, type Op, type Term } from './query-parse';
import {
  COLOR_COMBO_GROUPS,
  COLORS,
  EMPTY_QUERY,
  FIELD_TERMS,
  FIELDS,
  FLAGS,
  FORMATS,
  ORDERS,
  RARITIES,
  type FieldId,
  type QueryState,
} from './scryfall-syntax';

/** One of the things the query ANDs together at its top level. */
export interface Condition {
  node: Expr;
  start: number;
  end: number;
  /** Its text, as typed. */
  text: string;
}

export interface QueryReading {
  /** What the form shows. */
  state: QueryState;
  conditions: Condition[];
  /** The conditions behind each field, in query order. */
  claims: Map<FieldId, Condition[]>;
  /** The conditions no field can show: they get pins. */
  extras: Condition[];
}

const EQ: readonly Op[] = [':', '='];
const CMP: readonly Op[] = [':', '=', '!=', '<', '<=', '>', '>='];
const NUMBER = /^\d+(\.\d+)?$/;

/**
 * A term the form can hold: not negated, not an exact name, with a value, and
 * no regex unless the field takes one (a regex with a space in it never fits).
 */
function keyed(node: Expr, keys: readonly string[], ops: readonly (Op | '')[], regex = false): Term | null {
  if (node.kind !== 'term' || node.negated || node.exact || (node.regex && (!regex || /\s/.test(node.value)))) return null;
  return keys.includes(node.key) && ops.includes(node.op) && node.value !== '' ? node : null;
}

/** `a`, `(a)`, `a or b`, `(a or b)` -> its terms; anything else -> null. */
function alternatives(node: Expr): Expr[] | null {
  if (node.kind === 'group') return !node.negated && node.body ? alternatives(node.body) : null;
  if (node.kind === 'or') return node.items;
  return node.kind === 'term' ? [node] : null;
}

/** Every alternative is a `keys` term with a value `pick` accepts -> the picked values. */
function anyOf(node: Expr, keys: readonly string[], pick: (value: string) => string | null): string[] | null {
  const values = alternatives(node)?.map((alt) => {
    const t = keyed(alt, keys, EQ);
    return t && pick(t.value.toLowerCase());
  });
  return values?.every((v): v is string => !!v) ? [...new Set(values)] : null;
}

/** A word as the rules text and type fields hold it: `"a card"` keeps its quotes, a regex its slashes. */
const word = (t: Term): string => (t.regex ? `/${t.value}/` : /[\s"]/.test(t.value) ? `"${t.value}"` : t.value);
const add = (field: string, more: string): string => (field ? `${field} ${more}` : more);
/** `pow>=4` -> ">=4"; plain equality shows as just the value. */
const compareText = (t: Term): string => (t.op === '=' || t.op === ':' ? t.value : `${t.op}${t.value}`);

const COMBOS = new Map(COLOR_COMBO_GROUPS.flatMap((g) => g.combos.map((c): [string, string] => [c.name, c.colors])));
const RARITY_SHORT: Record<string, string> = { c: 'common', u: 'uncommon', r: 'rare', m: 'mythic' };

/** `ur`, `izzet` -> ['U', 'R'], in WUBRG order; null for anything else. */
function colorLetters(value: string): string[] | null {
  const letters = (COMBOS.get(value) ?? value).toUpperCase();
  if (!/^[WUBRG]+$/.test(letters) || new Set(letters).size !== letters.length) return null;
  return COLORS.filter((c) => letters.includes(c));
}

interface Claimer {
  field: FieldId;
  /** Takes every condition it matches (they add up), not only the first. */
  many?: boolean;
  /** What `node` sets in the form, given what the conditions before it set; null if it isn't this field's. */
  read: (node: Expr, state: QueryState) => Partial<QueryState> | null;
}

const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

const CLAIMERS: readonly Claimer[] = [
  {
    field: 'name',
    many: true,
    read: (n, s) => {
      const t = keyed(n, ['', 'name'], ['', ':']);
      return t ? { name: add(s.name, t.value) } : null;
    },
  },
  {
    field: 'text',
    many: true,
    read: (n, s) => {
      const t = keyed(n, ['o', 'oracle'], [':'], true);
      return t ? { text: add(s.text, word(t)) } : null;
    },
  },
  {
    field: 'type',
    many: true,
    read: (n, s) => {
      const t = keyed(n, ['t', 'type'], [':'], true);
      return t ? { type: add(s.type, word(t)) } : null;
    },
  },
  {
    field: 'colors',
    read: (n) => {
      const combos = anyOf(n, ['c', 'color'], (v) => (COMBOS.has(v) ? v : null));
      if (combos && alternatives(n)?.every((alt) => (alt as Term).op === '=')) return { colorCombos: combos };
      const t = keyed(n, ['c', 'color'], ['<=', ':', '=']);
      if (!t) return null;
      const v = t.value.toLowerCase();
      if (t.op === '<=') {
        const colors = colorLetters(v);
        return colors ? { colors } : null;
      }
      return v === 'c' || v === 'colorless' ? { colorless: true } : null;
    },
  },
  {
    field: 'manaValue',
    read: (n) => {
      const t = keyed(n, ['mv', 'cmc', 'manavalue'], CMP);
      if (!t || t.op === '!=' || !NUMBER.test(t.value)) return null;
      return { manaValue: t.value, manaValueOp: t.op === ':' ? '=' : (t.op as QueryState['manaValueOp']) };
    },
  },
  {
    field: 'rarity',
    read: (n) => {
      const rarity = anyOf(n, ['r', 'rarity'], (v) => (has(RARITIES, v) ? v : (RARITY_SHORT[v] ?? null)));
      return rarity ? { rarity } : null;
    },
  },
  {
    field: 'sets',
    read: (n) => {
      const sets = anyOf(n, ['s', 'e', 'set', 'edition'], (v) => (/^[a-z0-9]+$/.test(v) ? v : null));
      return sets ? { sets } : null;
    },
  },
  {
    field: 'format',
    read: (n) => {
      const t = keyed(n, ['f', 'format', 'legal'], EQ);
      const v = t?.value.toLowerCase() ?? '';
      return has(FORMATS, v) ? { format: v } : null;
    },
  },
  {
    field: 'price',
    read: (n) => {
      const t = keyed(n, ['usd', 'eur'], ['<=']);
      return t && NUMBER.test(t.value) ? { priceMax: t.value, priceCurrency: t.key as QueryState['priceCurrency'] } : null;
    },
  },
  {
    field: 'power',
    read: (n) => {
      const t = keyed(n, ['pow', 'power'], CMP);
      return t ? { power: compareText(t) } : null;
    },
  },
  {
    field: 'toughness',
    read: (n) => {
      const t = keyed(n, ['tou', 'toughness'], CMP);
      return t ? { toughness: compareText(t) } : null;
    },
  },
  {
    field: 'artist',
    read: (n) => {
      const t = keyed(n, ['a', 'artist'], [':']);
      return t ? { artist: t.value } : null;
    },
  },
  {
    field: 'year',
    read: (n) => {
      const t = keyed(n, ['year'], CMP);
      return t ? { year: compareText(t) } : null;
    },
  },
  {
    field: 'flags',
    many: true,
    read: (n, s) => {
      const v = keyed(n, ['is'], [':'])?.value.toLowerCase() ?? '';
      return has(FLAGS, v) ? { flags: s.flags.includes(v) ? s.flags : [...s.flags, v] } : null;
    },
  },
  {
    field: 'order',
    read: (n) => {
      const v = keyed(n, ['order'], [':'])?.value.toLowerCase() ?? '';
      return has(ORDERS, v) ? { order: v } : null;
    },
  },
  {
    field: 'direction',
    read: (n) => {
      const v = keyed(n, ['direction'], [':'])?.value.toLowerCase() ?? '';
      return v === 'asc' || v === 'desc' ? { direction: v } : null;
    },
  },
];

/**
 * Reads the form out of a query. Each top-level condition goes to the first
 * field that can show it; a field that holds one value takes only the first
 * condition it matches, and later ones become pins like anything else the form
 * has no field for.
 */
export function readQuery(query: string): QueryReading {
  const conditions = topLevel(parseQuery(query)).map((node) => ({ node, start: node.start, end: node.end, text: query.slice(node.start, node.end) }));
  let state: QueryState = EMPTY_QUERY;
  const claims = new Map<FieldId, Condition[]>();
  const extras: Condition[] = [];

  next: for (const condition of conditions) {
    for (const claimer of CLAIMERS) {
      if (!claimer.many && claims.has(claimer.field)) continue;
      const patch = claimer.read(condition.node, state);
      if (!patch) continue;
      state = { ...state, ...patch };
      claims.set(claimer.field, [...(claims.get(claimer.field) ?? []), condition]);
      continue next;
    }
    extras.push(condition);
  }
  return { state, conditions, claims, extras };
}

/**
 * Writes the form back into the query. Only the fields whose terms change are
 * touched: their conditions are rewritten in place, one term each, extra ones
 * dropped, new ones added after the field's last condition (or at the end).
 * Everything else keeps its text and its place.
 */
export function writeQuery(query: string, next: QueryState): string {
  const reading = readQuery(query);
  const replace = new Map<Condition, string | null>();
  const after = new Map<Condition | null, string[]>();

  for (const field of FIELDS) {
    const was = FIELD_TERMS[field](reading.state);
    const now = FIELD_TERMS[field](next);
    if (was.length === now.length && was.every((t, i) => t === now[i])) continue;
    const claimed = reading.claims.get(field) ?? [];
    claimed.forEach((c, i) => replace.set(c, now[i] ?? null));
    const rest = now.slice(claimed.length);
    const anchor = claimed[claimed.length - 1] ?? null;
    if (rest.length) after.set(anchor, [...(after.get(anchor) ?? []), ...rest]);
  }
  if (replace.size === 0 && after.size === 0) return query;
  return assemble(query, reading.conditions, replace, after);
}

/**
 * Takes one top-level condition out of the query, with the space or connector
 * that tied it to its neighbour. Found where it was read; if the query has been
 * typed into since and it moved, found by its text; if it's gone, nothing changes.
 */
export function removeCondition(query: string, condition: Pick<Condition, 'start' | 'end' | 'text'>): string {
  const { conditions } = readQuery(query);
  const target =
    conditions.find((c) => c.start === condition.start && c.end === condition.end && c.text === condition.text) ??
    conditions.find((c) => c.text === condition.text);
  return target ? assemble(query, conditions, new Map([[target, null]]), new Map()) : query;
}

/**
 * Lays the conditions back out with their edits. A kept condition keeps the
 * text that stood before it (a space, ` and `), so removing one never leaves a
 * dangling connector; whatever sat outside every condition — spaces, a
 * half-typed `or` — is dropped.
 */
function assemble(query: string, conditions: Condition[], replace: Map<Condition, string | null>, after: Map<Condition | null, string[]>): string {
  const parts: { sep: string; text: string }[] = [];
  conditions.forEach((c, i) => {
    const text = replace.has(c) ? replace.get(c) : c.text;
    if (text) parts.push({ sep: i === 0 ? ' ' : query.slice((conditions[i - 1] as Condition).end, c.start) || ' ', text });
    for (const added of after.get(c) ?? []) parts.push({ sep: ' ', text: added });
  });
  for (const added of after.get(null) ?? []) parts.push({ sep: ' ', text: added });

  // A whole query of `a or b` would swallow whatever is ANDed on after it: `a or b c` is `a or (b c)`.
  const lone = conditions.length === 1 ? conditions[0] : undefined;
  const first = parts[0];
  if (lone?.node.kind === 'or' && !replace.has(lone) && parts.length > 1 && first) first.text = `(${first.text})`;

  return parts.map((p, i) => (i === 0 ? p.text : p.sep + p.text)).join('');
}
