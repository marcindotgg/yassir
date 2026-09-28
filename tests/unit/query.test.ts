import { describe, expect, it } from 'vitest';
import { describeNode, type SetNameLookup } from '../../src/lib/query-dictionary';
import { parseQuery, topLevel, type Term } from '../../src/lib/query-parse';
import { readQuery, removeCondition, writeQuery } from '../../src/lib/query-sync';
import { buildQuery, EMPTY_QUERY, toggleColorOption, type QueryState } from '../../src/lib/scryfall-syntax';

const conditions = (q: string) => topLevel(parseQuery(q)).map((n) => q.slice(n.start, n.end));
const otherConditions = (q: string) => readQuery(q).otherConditions.map((c) => c.text);
const pins = (q: string, setName?: SetNameLookup) => readQuery(q).otherConditions.map((c) => describeNode(c.node, setName).text);
const edit = (q: string, patch: Partial<QueryState>) => writeQuery(q, { ...readQuery(q).state, ...patch });

describe('query parser', () => {
  it('splits a query into its top-level conditions, quotes, regexes and groups included', () => {
    expect(conditions('t:instant o:"draw a card" (r:rare or r:mythic) -c:r o:/^{T}: add/ bolt')).toEqual([
      't:instant',
      'o:"draw a card"',
      '(r:rare or r:mythic)',
      '-c:r',
      'o:/^{T}: add/',
      'bolt',
    ]);
  });

  it('reads keywords, operators, negation and exact names', () => {
    const [a, b, c, d] = topLevel(parseQuery('MV>=3 -is:reprint !"Lightning Bolt" "grizzly bears"')) as Term[];
    expect(a).toMatchObject({ key: 'mv', op: '>=', value: '3', negated: false });
    expect(b).toMatchObject({ key: 'is', op: ':', value: 'reprint', negated: true });
    expect(c).toMatchObject({ key: '', value: 'Lightning Bolt', exact: true, quoted: true });
    expect(d).toMatchObject({ key: '', value: 'grizzly bears', quoted: true, exact: false });
  });

  it('binds AND tighter than OR, as Scryfall does', () => {
    const root = parseQuery('t:instant r:mythic or t:sorcery');
    expect(root?.kind).toBe('or');
    expect(conditions('t:instant r:mythic or t:sorcery')).toEqual(['t:instant r:mythic or t:sorcery']);
    expect(conditions('t:instant and r:mythic')).toEqual(['t:instant', 'r:mythic']);
  });

  it('survives half-typed and broken input', () => {
    expect(conditions('t:elf or')).toEqual(['t:elf']);
    expect(conditions('(t:elf or t:goblin')).toEqual(['(t:elf or t:goblin']);
    expect(conditions('t:elf ) c:g')).toEqual(['t:elf', ')', 'c:g']);
    expect(conditions('o:"draw a')).toEqual(['o:"draw a']);
    expect(conditions('   ')).toEqual([]);
    expect(conditions('()')).toEqual(['()']);
  });
});

describe('reading the form out of the query', () => {
  it('fills every field it has a term for', () => {
    const q = 'bolt t:instant o:draw o:"a card" (c<=ur -c:c) mv>=2 (r:rare or r:mythic) (s:mh3 or s:ltr) f:modern eur<=1.5 pow>=4 tou=2 a:"Seb McKinnon" otag:removal otag:mana-rock year>=2020 is:foil order:eur direction:desc';
    const { state, otherConditions: rest } = readQuery(q);
    expect(rest).toEqual([]);
    expect(state).toEqual({
      ...EMPTY_QUERY,
      name: 'bolt',
      type: 'instant',
      rulesText: 'draw "a card"',
      colors: ['U', 'R'],
      manaValue: '>=2',
      rarity: ['rare', 'mythic'],
      sets: ['mh3', 'ltr'],
      format: 'modern',
      priceMax: '1.5',
      priceCurrency: 'eur',
      power: '>=4',
      toughness: '2',
      artist: 'Seb McKinnon',
      otag: 'removal mana-rock',
      year: '>=2020',
      flags: ['foil'],
      order: 'eur',
      direction: 'desc',
    });
  });

  it('reads back everything the form writes', () => {
    const states: Partial<QueryState>[] = [
      { name: 'Lightning Bolt', colorless: true, rarity: ['common'] },
      { colors: ['R', 'W'], type: 'instant' },
      { colors: ['G'], manaValue: '2' },
      { colorCombos: ['orzhov', 'izzet'], sets: ['mh3'], flags: ['foil', 'promo'], order: 'name' },
      { rulesText: 'draw "a card"', type: 'legendary creature', manaValue: '<3', priceMax: '2', priceCurrency: 'usd' },
      { name: "Urza's", power: '!=3', otag: 'removal ramp', year: '2020', direction: 'asc' },
    ];
    for (const s of states) {
      const state = { ...EMPTY_QUERY, ...s };
      const reading = readQuery(buildQuery(state));
      expect(reading.otherConditions).toEqual([]);
      expect(buildQuery(reading.state)).toBe(buildQuery(state));
    }
  });

  it('understands aliases, short forms and color nicknames', () => {
    expect(readQuery('type:elf oracle:flying cmc:3 rarity:m e:MH3 legal:pauper usd<=5 power>2 artist:avon function:removal').state).toMatchObject({
      type: 'elf',
      rulesText: 'flying',
      manaValue: '3',
      rarity: ['mythic'],
      sets: ['mh3'],
      format: 'pauper',
      priceMax: '5',
      priceCurrency: 'usd',
      power: '>2',
      artist: 'avon',
      otag: 'removal',
    });
    expect(readQuery('color=R').state.colors).toEqual(['R']);
    expect(readQuery('(-color=colorless c<=izzet)').state.colors).toEqual(['U', 'R']);
    expect(readQuery('c:c').state.colorless).toBe(true);
    expect(readQuery('c=colorless').state.colorless).toBe(true);
    expect(readQuery('c=jund').state.colorCombos).toEqual(['jund']);
    expect(readQuery('(c=orzhov or c=izzet)').state.colorCombos).toEqual(['orzhov', 'izzet']);
  });

  it('pins what no field can show', () => {
    expect(otherConditions('-t:creature c>=r c<=ur -c:c (c=u or c=r) c:r c:izzet kw:flying f:penny is:fetchland r>=rare o:/draw a/ !fire foo:bar')).toEqual([
      '-t:creature',
      'c>=r',
      'c<=ur',
      '-c:c',
      '(c=u or c=r)',
      'c:r',
      'c:izzet',
      'kw:flying',
      'f:penny',
      'is:fetchland',
      'r>=rare',
      'o:/draw a/',
      '!fire',
      'foo:bar',
    ]);
  });

  it('gives a single-value field only its first condition', () => {
    const r = readQuery('f:modern f:legacy c=r c=izzet');
    expect(r.state.format).toBe('modern');
    expect(r.state.colors).toEqual(['R']);
    expect(r.otherConditions.map((c) => c.text)).toEqual(['f:legacy', 'c=izzet']);
  });

  it('shows nothing in the form when the whole query is an OR', () => {
    const r = readQuery('t:instant r:mythic or t:sorcery');
    expect(r.state).toEqual(EMPTY_QUERY);
    expect(r.otherConditions).toHaveLength(1);
    expect(readQuery('r:rare or r:mythic').state.rarity).toEqual(['rare', 'mythic']);
  });
});

describe('writing the form into the query', () => {
  it('rewrites a changed field in place and leaves the rest of the text alone', () => {
    expect(edit('t:instant  kw:flying   s:mh3', { type: 'sorcery' })).toBe('t:sorcery  kw:flying   s:mh3');
    expect(edit('kw:flying mv=2 -is:reprint', { manaValue: '<=3' })).toBe('kw:flying mv<=3 -is:reprint');
    expect(edit('T:Instant c=r', { colors: ['R', 'U'] })).toBe('T:Instant (c<=ur -c:c)');
    expect(edit('(c<=ur -c:c) t:elf', { colors: ['U'] })).toBe('c=u t:elf');
  });

  it('adds a new field at the end and drops an emptied one with its separator', () => {
    expect(edit('kw:flying', { format: 'modern' })).toBe('kw:flying f:modern');
    expect(edit('kw:flying f:modern t:elf', { format: '' })).toBe('kw:flying t:elf');
    expect(edit('f:modern and t:elf', { format: '' })).toBe('t:elf');
    expect(edit('t:elf and f:modern', { format: '' })).toBe('t:elf');
    expect(edit('', { name: 'Lightning Bolt' })).toBe('name:"Lightning Bolt"');
  });

  it('edits a many-term field term by term', () => {
    expect(edit('o:draw kw:flying', { rulesText: 'draw a card' })).toBe('o:draw o:a o:card kw:flying');
    expect(edit('o:draw kw:flying o:card', { rulesText: 'draw' })).toBe('o:draw kw:flying');
    expect(edit('is:foil t:elf is:promo', { flags: ['promo'] })).toBe('is:promo t:elf');
    expect(edit('is:foil t:elf', { flags: ['foil', 'promo'] })).toBe('is:foil is:promo t:elf');
    expect(edit('otag:removal t:elf', { otag: 'removal ramp' })).toBe('otag:removal otag:ramp t:elf');
  });

  it('turns an alternative into an or-group where the field stood', () => {
    expect(edit('r:rare t:elf', { rarity: ['rare', 'mythic'] })).toBe('(r:rare or r:mythic) t:elf');
    expect(edit('(s:mh3 or s:ltr) t:elf', { sets: ['ltr'] })).toBe('s:ltr t:elf');
  });

  it('leaves the query alone when a change writes nothing new', () => {
    expect(edit('t:elf', { priceCurrency: 'usd' })).toBe('t:elf');
    expect(edit('t:elf ', { manaValue: '' })).toBe('t:elf ');
  });

  it('brackets a bare OR before ANDing anything onto it', () => {
    expect(edit('t:instant or t:sorcery', { colors: ['R'] })).toBe('(t:instant or t:sorcery) c=r');
    expect(edit('r:rare or r:mythic', { rarity: ['rare'] })).toBe('r:rare');
  });

  it('keeps a picked color kind exclusive in the query too', () => {
    const q = 'c=r t:elf';
    const state = readQuery(q).state;
    expect(writeQuery(q, { ...state, ...toggleColorOption(state, { kind: 'combo', value: 'izzet' }) })).toBe('c=izzet t:elf');
  });
});

describe('removing a pinned condition', () => {
  it('takes the condition and its separator out', () => {
    const q = 't:elf kw:flying and -is:reprint foo:bar';
    const at = (text: string) => readQuery(q).conditions.find((c) => c.text === text) as { start: number; end: number; text: string };
    expect(removeCondition(q, at('kw:flying'))).toBe('t:elf and -is:reprint foo:bar');
    expect(removeCondition(q, at('foo:bar'))).toBe('t:elf kw:flying and -is:reprint');
    expect(removeCondition(q, at('t:elf'))).toBe('kw:flying and -is:reprint foo:bar');
    expect(removeCondition('t:elf', { start: 0, end: 99, text: 'kw:flying' })).toBe('t:elf');
    expect(removeCondition(`t:elf ${q}`, at('foo:bar'))).toBe('t:elf t:elf kw:flying and -is:reprint');
  });
});

describe('naming pinned conditions', () => {
  it('names keywords, operators and negations', () => {
    expect(pins('kw:flying atag:dragon -t:creature loy>=3 usd>10 c>=wu id<=izzet')).toEqual([
      'Keyword: flying',
      'Art tag: dragon',
      'not Type: creature',
      'Loyalty ≥ 3',
      'Price (USD) > 10',
      'Colors ≥ WU',
      'Color identity ≤ Izzet',
    ]);
  });

  it('names flags, including double negatives', () => {
    expect(pins('is:fetchland not:reprint -is:dfc -not:promo is:whatever has:watermark new:art')).toEqual([
      'Fetch land',
      'not Reprint',
      'not Double-faced',
      'Promo',
      'Is: whatever',
      'Has watermark',
      'New art',
    ]);
  });

  it('reads alternatives on one keyword as one, and nests the rest', () => {
    expect(pins('(t:goblin or t:elf) (is:fetchland or is:shockland) -(kw:flying or o:reach) (t:elf kw:haste or f:penny)')).toEqual([
      'Type: goblin or elf',
      'Fetch land or Shock land',
      'not (Keyword: flying or Rules text: reach)',
      '(Type: elf and Keyword: haste) or Legal in: penny',
    ]);
  });

  it('names sets from the set list, and exact or excluded names', () => {
    const setName = (code: string) => (code === 'mh3' ? 'Modern Horizons 3' : undefined);
    expect(pins('-s:mh3 in:xyz !"Lightning Bolt" -bolt', setName)).toEqual(['not Set: Modern Horizons 3', 'Printed in: xyz', 'Exact name: “Lightning Bolt”', 'not Name: bolt']);
  });

  it('flags keywords Scryfall does not know, and stray brackets', () => {
    const q = 'foo:bar n:bolt kw:flying )';
    expect(readQuery(q).otherConditions.map((c) => describeNode(c.node))).toEqual([
      { text: 'foo: bar', known: false },
      { text: 'n: bolt', known: false },
      { text: 'Keyword: flying', known: true },
      { text: 'Unmatched “)”', known: false },
    ]);
  });
});
