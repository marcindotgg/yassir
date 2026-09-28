export type Op = ':' | '=' | '!=' | '<' | '<=' | '>' | '>=';

interface Span {
  start: number;
  end: number;
}

export interface Term extends Span {
  kind: 'term';
  negated: boolean;
  /** '' for a bare word, which Scryfall matches against card names. */
  key: string;
  op: Op | '';
  value: string;
  quoted: boolean;
  regex: boolean;
  exact: boolean;
}

export interface Group extends Span {
  kind: 'group';
  negated: boolean;
  body: Expr | null;
}

export interface List extends Span {
  kind: 'and' | 'or';
  items: Expr[];
}

export interface Stray extends Span {
  kind: 'stray';
}

export type Expr = Term | Group | List | Stray;

type OpenToken = Span & { type: 'open'; negated: boolean };
type Token = OpenToken | (Span & { type: 'close' | 'or' | 'and' }) | { type: 'leaf'; leaf: Term | Stray };

const OPERATORS: readonly Op[] = ['<=', '>=', '!=', ':', '=', '<', '>'];
const KEYWORD = /^[a-zA-Z]+/;

/**
 * Tolerant of half-typed input: everything parses into something. A connector
 * with nothing on one side (`t:elf or`) is left out of the tree.
 */
export function parseQuery(query: string): Expr | null {
  const tokens = tokenize(query);
  let pos = 0;

  const parseOr = (): Expr | null => {
    const items: Expr[] = [];
    for (;;) {
      const item = parseAnd();
      if (item) items.push(item);
      if (tokens[pos]?.type !== 'or') return listOf('or', items);
      pos++;
    }
  };

  const parseAnd = (): Expr | null => {
    const items: Expr[] = [];
    for (let token = tokens[pos]; token && token.type !== 'or' && token.type !== 'close'; token = tokens[pos]) {
      pos++;
      if (token.type === 'open') items.push(parseGroup(token));
      else if (token.type === 'leaf') items.push(token.leaf);
    }
    return listOf('and', items);
  };

  const parseGroup = (open: OpenToken): Group => {
    const body = parseOr();
    const close = tokens[pos];
    const closed = close?.type === 'close';
    if (closed) pos++;
    const end = closed ? close.end : Math.max(open.end, body?.end ?? 0);
    return { kind: 'group', negated: open.negated, body, start: open.start, end };
  };

  return parseOr();
}

/** The conditions a query ANDs together at its top level, in order. */
export function topLevel(root: Expr | null): Expr[] {
  if (!root) return [];
  return root.kind === 'and' ? root.items : [root];
}

function listOf(kind: 'and' | 'or', items: Expr[]): Expr | null {
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return null;
  return items.length === 1 ? first : { kind, items, start: first.start, end: last.end };
}

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let i = 0;

  const readDelimited = (mark: string): string => {
    let text = '';
    i++;
    while (i < query.length && query[i] !== mark) {
      if (query[i] === '\\' && query[i + 1] === mark) i++;
      text += query[i];
      i++;
    }
    i = Math.min(i + 1, query.length);
    return text;
  };

  const readWord = (): string => {
    const start = i;
    while (i < query.length && !/[\s()]/.test(query[i] as string)) i++;
    return query.slice(start, i);
  };

  const readTerm = (start: number): Term => {
    const negated = query[i] === '-';
    if (negated) i++;
    const exact = query[i] === '!';
    if (exact) i++;

    const keyword = exact ? undefined : KEYWORD.exec(query.slice(i))?.[0];
    const op = keyword && OPERATORS.find((candidate) => query.startsWith(candidate, i + keyword.length));
    const key = keyword && op ? keyword.toLowerCase() : '';
    if (keyword && op) i += keyword.length + op.length;

    const quoted = query[i] === '"';
    const regex = !quoted && query[i] === '/' && key !== '';
    const value = quoted ? readDelimited('"') : regex ? readDelimited('/') : readWord();
    return { kind: 'term', negated, key, op: op || '', value, quoted, regex, exact, start, end: i };
  };

  while (i < query.length) {
    const start = i;
    const char = query[i] as string;
    if (/\s/.test(char)) {
      i++;
    } else if (char === '(' || query.startsWith('-(', i)) {
      const negated = char === '-';
      i += negated ? 2 : 1;
      depth++;
      tokens.push({ type: 'open', negated, start, end: i });
    } else if (char === ')') {
      i++;
      if (depth > 0) {
        depth--;
        tokens.push({ type: 'close', start, end: i });
      } else {
        tokens.push({ type: 'leaf', leaf: { kind: 'stray', start, end: i } });
      }
    } else {
      const term = readTerm(start);
      const connector = connectorOf(term);
      tokens.push(connector ? { type: connector, start, end: term.end } : { type: 'leaf', leaf: term });
    }
  }
  return tokens;
}

function connectorOf(term: Term): 'or' | 'and' | null {
  if (term.op || term.negated || term.exact || term.quoted) return null;
  const word = term.value.toLowerCase();
  return word === 'or' || word === 'and' ? word : null;
}
