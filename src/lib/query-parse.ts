// Scryfall query text -> a tree that remembers where each part sits in the text,
// so the builder can read conditions out of the box and rewrite them in place.
// Tolerant: anything typed parses into something, half-finished input included.
// No DOM, unit-tested.

export type Op = ':' | '=' | '!=' | '<' | '<=' | '>' | '>=';

interface Span {
  /** Offsets into the query text, end exclusive. */
  start: number;
  end: number;
}

export interface Term extends Span {
  kind: 'term';
  negated: boolean;
  /** Lower-case keyword; '' for a bare word, which Scryfall searches in card names. */
  key: string;
  op: Op | '';
  /** Without its quotes or slashes. */
  value: string;
  quoted: boolean;
  /** `o:/^{T}:/` */
  regex: boolean;
  /** `!fire`, `!"Lightning Bolt"`: that exact card name. */
  exact: boolean;
}

export interface Group extends Span {
  kind: 'group';
  negated: boolean;
  /** null for `()`. */
  body: Expr | null;
}

/** Two or more items. Scryfall ANDs whatever sits side by side, and AND binds tighter than OR. */
export interface List extends Span {
  kind: 'and' | 'or';
  items: Expr[];
}

/** A `)` with nothing to close. Kept so that no part of the text goes missing. */
export interface Stray extends Span {
  kind: 'stray';
}

export type Expr = Term | Group | List | Stray;

type Token =
  | (Span & { type: 'open'; negated: boolean })
  | (Span & { type: 'close' })
  | (Span & { type: 'or' })
  | (Span & { type: 'and' })
  | { type: 'leaf'; leaf: Term | Stray };

const OPS: readonly Op[] = ['<=', '>=', '!=', ':', '=', '<', '>'];
const KEYWORD = /^[a-zA-Z]+/;

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let i = 0;

  /** Reads a `"…"` or `/…/` from its opening mark; an unterminated one runs to the end. */
  const delimited = (mark: string): string => {
    let out = '';
    i++;
    while (i < query.length && query[i] !== mark) {
      if (query[i] === '\\' && query[i + 1] === mark) i++;
      out += query[i];
      i++;
    }
    i++;
    return out;
  };
  const word = (): string => {
    const from = i;
    while (i < query.length && !/[\s()]/.test(query[i] as string)) i++;
    return query.slice(from, i);
  };

  while (i < query.length) {
    const ch = query[i] as string;
    const start = i;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(' || (ch === '-' && query[i + 1] === '(')) {
      i += ch === '(' ? 1 : 2;
      depth++;
      tokens.push({ type: 'open', negated: ch === '-', start, end: i });
      continue;
    }
    if (ch === ')') {
      i++;
      if (depth > 0) {
        depth--;
        tokens.push({ type: 'close', start, end: i });
      } else tokens.push({ type: 'leaf', leaf: { kind: 'stray', start, end: i } });
      continue;
    }

    const negated = ch === '-';
    if (negated) i++;
    const exact = query[i] === '!';
    if (exact) i++;

    const term: Omit<Term, 'end'> = { kind: 'term', negated, key: '', op: '', value: '', quoted: false, regex: false, exact, start };
    const key = exact ? null : KEYWORD.exec(query.slice(i));
    const op = key ? OPS.find((o) => query.startsWith(o, i + key[0].length)) : undefined;
    if (key && op) {
      term.key = key[0].toLowerCase();
      term.op = op;
      i += key[0].length + op.length;
    }
    if (query[i] === '"') {
      term.quoted = true;
      term.value = delimited('"');
    } else if (query[i] === '/' && term.op) {
      term.regex = true;
      term.value = delimited('/');
    } else term.value = word();
    i = Math.min(i, query.length);

    const lower = term.value.toLowerCase();
    if (!term.op && !negated && !exact && !term.quoted && (lower === 'or' || lower === 'and')) {
      tokens.push({ type: lower, start, end: i });
    } else tokens.push({ type: 'leaf', leaf: { ...term, end: i } });
  }
  return tokens;
}

/**
 * Parses a Scryfall query. Returns null for a blank one. Lists of one collapse
 * into their item, and a connector with nothing on one side (`t:elf or`, being
 * typed) is left out of the tree: its text sits between the nodes.
 */
export function parseQuery(query: string): Expr | null {
  const tokens = tokenize(query);
  let pos = 0;
  const peek = () => tokens[pos];

  const list = (kind: 'and' | 'or', items: Expr[]): Expr | null => {
    if (items.length === 0) return null;
    if (items.length === 1) return items[0] as Expr;
    return { kind, items, start: (items[0] as Expr).start, end: (items[items.length - 1] as Expr).end };
  };

  const or = (): Expr | null => {
    const items: Expr[] = [];
    for (;;) {
      const item = and();
      if (item) items.push(item);
      if (peek()?.type !== 'or') break;
      pos++;
    }
    return list('or', items);
  };

  const and = (): Expr | null => {
    const items: Expr[] = [];
    for (let t = peek(); t && t.type !== 'or' && t.type !== 'close'; t = peek()) {
      pos++;
      if (t.type === 'and') continue;
      if (t.type === 'open') {
        const body = or();
        const close = peek();
        const closed = close?.type === 'close';
        if (closed) pos++;
        items.push({ kind: 'group', negated: t.negated, body, start: t.start, end: closed ? close.end : Math.max(t.end, body?.end ?? 0) });
      } else items.push(t.leaf);
    }
    return list('and', items);
  };

  return or();
}

/** The conditions a query ANDs together at its top level, in order. */
export function topLevel(root: Expr | null): Expr[] {
  if (!root) return [];
  return root.kind === 'and' ? root.items : [root];
}
