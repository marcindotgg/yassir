import { type Expr, type Op, parseQuery, type Term, topLevel } from './query-parse';
import {
  COLOR_COMBO_GROUPS,
  COLORS,
  DECIMAL,
  EMPTY_QUERY,
  FIELD_TERMS,
  FIELDS,
  type FieldId,
  FLAGS,
  FORMATS,
  ORDERS,
  type QueryState,
  RARITIES,
} from './scryfall-syntax';

export interface Condition {
  node: Expr;
  start: number;
  end: number;
  text: string;
}

export interface QueryReading {
  state: QueryState;
  conditions: Condition[];
  conditionsByField: Map<FieldId, Condition[]>;
  otherConditions: Condition[];
}

type FieldReader = (node: Expr, state: QueryState) => Partial<QueryState> | null;

const EQUALITY: readonly Op[] = [':', '='];
const COMPARISON: readonly Op[] = [':', '=', '!=', '<', '<=', '>', '>='];
const COLOR_KEYS = ['c', 'color'];
const COMBO_COLORS = new Map(
  COLOR_COMBO_GROUPS.flatMap((group) => group.combos.map((combo) => [combo.name, combo.colors] as const)),
);
const RARITY_LETTERS: Record<string, string> = { c: 'common', u: 'uncommon', r: 'rare', m: 'mythic', s: 'special' };
const MULTI_CONDITION_FIELDS: ReadonlySet<FieldId> = new Set(['name', 'rulesText', 'type', 'otag', 'flags']);

const FIELD_READERS: Record<FieldId, FieldReader> = {
  name: (node, state) => {
    const term = matchTerm(node, ['', 'name'], ['', ':']);
    return term && { name: appendWord(state.name, term.value) };
  },
  rulesText: wordReader('rulesText', ['o', 'oracle'], { allowRegex: true }),
  type: wordReader('type', ['t', 'type'], { allowRegex: true }),
  colors: readColors,
  manaValue: comparisonReader('manaValue', ['mv', 'cmc', 'manavalue']),
  rarity: (node) => {
    const rarity = alternativeValues(node, ['r', 'rarity'], (value) =>
      isOneOf(RARITIES, value) ? value : (RARITY_LETTERS[value] ?? null),
    );
    return rarity && { rarity };
  },
  sets: (node) => {
    const sets = alternativeValues(node, ['s', 'e', 'set', 'edition'], (value) =>
      /^[a-z0-9]+$/.test(value) ? value : null,
    );
    return sets && { sets };
  },
  format: choiceReader('format', ['f', 'format', 'legal'], FORMATS, EQUALITY),
  price: (node) => {
    const term = matchTerm(node, ['usd', 'eur'], ['<=']);
    return term && DECIMAL.test(term.value)
      ? { priceMax: term.value, priceCurrency: term.key as QueryState['priceCurrency'] }
      : null;
  },
  power: comparisonReader('power', ['pow', 'power']),
  toughness: comparisonReader('toughness', ['tou', 'toughness']),
  artist: (node) => {
    const term = matchTerm(node, ['a', 'artist'], [':']);
    return term && { artist: term.value };
  },
  otag: wordReader('otag', ['otag', 'oracletag', 'function']),
  year: comparisonReader('year', ['year']),
  flags: (node, state) => {
    const flag = matchTerm(node, ['is'], [':'])?.value.toLowerCase() ?? '';
    if (!isOneOf(FLAGS, flag)) return null;
    return { flags: state.flags.includes(flag) ? state.flags : [...state.flags, flag] };
  },
  order: choiceReader('order', ['order'], ORDERS),
  direction: choiceReader('direction', ['direction'], ['asc', 'desc']),
};

export function readQuery(query: string): QueryReading {
  const conditions = topLevel(parseQuery(query)).map((node) => ({
    node,
    start: node.start,
    end: node.end,
    text: query.slice(node.start, node.end),
  }));
  const conditionsByField = new Map<FieldId, Condition[]>();
  const otherConditions: Condition[] = [];
  let state = EMPTY_QUERY;

  for (const condition of conditions) {
    const match = readCondition(condition.node, state, conditionsByField);
    if (!match) {
      otherConditions.push(condition);
      continue;
    }
    state = { ...state, ...match.patch };
    conditionsByField.set(match.field, [...(conditionsByField.get(match.field) ?? []), condition]);
  }
  return { state, conditions, conditionsByField, otherConditions };
}

/** Rewrites only the fields whose terms changed, in place; the rest of the text stays as typed. */
export function writeQuery(query: string, next: QueryState): string {
  const { state, conditions, conditionsByField } = readQuery(query);
  const replacements = new Map<Condition, string[]>();
  const appended: string[] = [];

  for (const field of FIELDS) {
    const oldTerms = FIELD_TERMS[field](state);
    const newTerms = FIELD_TERMS[field](next);
    if (sameTerms(oldTerms, newTerms)) continue;
    const current = conditionsByField.get(field) ?? [];
    if (current.length === 0) appended.push(...newTerms);
    current.forEach((condition, i) => {
      const isLast = i === current.length - 1;
      replacements.set(condition, isLast ? newTerms.slice(i) : newTerms.slice(i, i + 1));
    });
  }
  if (replacements.size === 0 && appended.length === 0) return query;
  return rebuild(query, conditions, replacements, appended);
}

export function removeCondition(query: string, condition: Pick<Condition, 'start' | 'end' | 'text'>): string {
  const { conditions } = readQuery(query);
  const target =
    conditions.find((c) => c.start === condition.start && c.end === condition.end && c.text === condition.text) ??
    conditions.find((c) => c.text === condition.text);
  return target ? rebuild(query, conditions, new Map([[target, []]])) : query;
}

function readCondition(
  node: Expr,
  state: QueryState,
  filled: Map<FieldId, Condition[]>,
): { field: FieldId; patch: Partial<QueryState> } | null {
  for (const field of FIELDS) {
    if (filled.has(field) && !MULTI_CONDITION_FIELDS.has(field)) continue;
    const patch = FIELD_READERS[field](node, state);
    if (patch) return { field, patch };
  }
  return null;
}

/** Each kept condition keeps the separator typed before it, so removing one never leaves a dangling `and`. */
function rebuild(
  query: string,
  conditions: Condition[],
  replacements: Map<Condition, string[]>,
  appended: readonly string[] = [],
): string {
  const parts: string[] = [];
  const append = (separator: string, text: string) => parts.push(parts.length > 0 ? separator + text : text);

  conditions.forEach((condition, i) => {
    const [text, ...inserted] = replacements.get(condition) ?? [condition.text];
    const previous = conditions[i - 1];
    if (text) append(previous ? query.slice(previous.end, condition.start) || ' ' : '', text);
    for (const term of inserted) append(' ', term);
  });
  for (const term of appended) append(' ', term);

  // A whole query of `a or b` would swallow whatever is ANDed on after it: `a or b c` is `a or (b c)`.
  const [only] = conditions;
  if (conditions.length === 1 && only?.node.kind === 'or' && !replacements.has(only) && parts.length > 1)
    parts[0] = `(${parts[0]})`;
  return parts.join('');
}

function sameTerms(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((term, i) => term === b[i]);
}

function matchTerm(node: Expr, keys: readonly string[], ops: readonly (Op | '')[], allowRegex = false): Term | null {
  if (node.kind !== 'term' || node.negated || node.exact || !node.value) return null;
  // A regex with a space in it would be split into several words on its way back into the query.
  if (node.regex && (!allowRegex || /\s/.test(node.value))) return null;
  return keys.includes(node.key) && ops.includes(node.op) ? node : null;
}

/** `a`, `(a)`, `a or b`, `(a or b)` -> its alternatives; null for anything else. */
function alternatives(node: Expr): Expr[] | null {
  if (node.kind === 'group') return !node.negated && node.body ? alternatives(node.body) : null;
  if (node.kind === 'or') return node.items;
  return node.kind === 'term' ? [node] : null;
}

function alternativeValues(
  node: Expr,
  keys: readonly string[],
  pick: (value: string) => string | null,
): string[] | null {
  const values = alternatives(node)?.map((alternative) => {
    const term = matchTerm(alternative, keys, EQUALITY);
    return term && pick(term.value.toLowerCase());
  });
  return values?.every((value): value is string => !!value) ? [...new Set(values)] : null;
}

function wordReader(
  field: 'rulesText' | 'type' | 'otag',
  keys: readonly string[],
  { allowRegex = false } = {},
): FieldReader {
  return (node, state) => {
    const term = matchTerm(node, keys, [':'], allowRegex);
    return term && { [field]: appendWord(state[field], fieldWord(term)) };
  };
}

function comparisonReader(field: 'manaValue' | 'power' | 'toughness' | 'year', keys: readonly string[]): FieldReader {
  return (node) => {
    const term = matchTerm(node, keys, COMPARISON);
    return term && { [field]: fieldComparison(term) };
  };
}

function choiceReader(
  field: 'format' | 'order' | 'direction',
  keys: readonly string[],
  choices: readonly string[],
  ops: readonly Op[] = [':'],
): FieldReader {
  return (node) => {
    const value = matchTerm(node, keys, ops)?.value.toLowerCase();
    return value && choices.includes(value) ? { [field]: value } : null;
  };
}

function readColors(node: Expr): Partial<QueryState> | null {
  const value = matchTerm(node, COLOR_KEYS, EQUALITY)?.value.toLowerCase();
  if (value === 'c' || value === 'colorless') return { colorless: true };
  const single = matchTerm(node, COLOR_KEYS, ['='])?.value.toUpperCase() ?? '';
  if (isOneOf(COLORS, single)) return { colors: [single] };
  const atMost = atMostColors(node);
  if (atMost) return { colors: atMost };
  const combos = exactCombos(node);
  return combos && { colorCombos: combos };
}

/** `(c<=ur -c:c)`, either way round -> ['U', 'R']. */
function atMostColors(node: Expr): string[] | null {
  if (node.kind !== 'group' || node.negated || node.body?.kind !== 'and' || node.body.items.length !== 2) return null;
  const { items } = node.body;
  const atMost = items.map((item) => matchTerm(item, COLOR_KEYS, ['<='])).find((term) => term !== null);
  return atMost && items.some(isNotColorless) ? colorLetters(atMost.value.toLowerCase()) : null;
}

function isNotColorless(node: Expr): boolean {
  if (node.kind !== 'term' || !node.negated || node.exact || node.regex) return false;
  return (
    COLOR_KEYS.includes(node.key) &&
    (node.op === ':' || node.op === '=') &&
    ['c', 'colorless'].includes(node.value.toLowerCase())
  );
}

// `c:izzet` means "at least blue and red"; only `c=izzet` is exactly the combination.
function exactCombos(node: Expr): string[] | null {
  if (!alternatives(node)?.every((alternative) => alternative.kind === 'term' && alternative.op === '=')) return null;
  return alternativeValues(node, COLOR_KEYS, (value) => (COMBO_COLORS.has(value) ? value : null));
}

function colorLetters(value: string): string[] | null {
  const letters = (COMBO_COLORS.get(value) ?? value).toUpperCase();
  if (!/^[WUBRG]+$/.test(letters) || new Set(letters).size !== letters.length) return null;
  return COLORS.filter((color) => letters.includes(color));
}

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

function appendWord(words: string, word: string): string {
  return words ? `${words} ${word}` : word;
}

function fieldWord(term: Term): string {
  if (term.regex) return `/${term.value}/`;
  return /[\s"]/.test(term.value) ? `"${term.value}"` : term.value;
}

function fieldComparison(term: Term): string {
  return term.op === '=' || term.op === ':' ? term.value : `${term.op}${term.value}`;
}
