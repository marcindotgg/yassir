import { describe, expect, it } from 'vitest';
import { findSet, normalize, parseSets, type SetSummary, searchSets, setMeta } from '../../src/lib/sets';

const set = (over: Partial<SetSummary>): SetSummary => ({
  code: 'xxx',
  name: 'Some Set',
  releasedAt: '2020-01-01',
  setType: 'expansion',
  cardCount: 100,
  digital: false,
  iconUri: '',
  ...over,
});

const SETS: SetSummary[] = [
  set({
    code: 'mh3',
    name: 'Modern Horizons 3',
    releasedAt: '2024-06-14',
    setType: 'draft_innovation',
    cardCount: 303,
  }),
  set({
    code: 'mh2',
    name: 'Modern Horizons 2',
    releasedAt: '2021-06-18',
    setType: 'draft_innovation',
    cardCount: 303,
  }),
  set({
    code: 'tmh3',
    name: 'Modern Horizons 3 Tokens',
    releasedAt: '2024-06-14',
    setType: 'token',
    cardCount: 30,
    parent: 'mh3',
  }),
  set({ code: 'ltr', name: 'The Lord of the Rings: Tales of Middle-earth', releasedAt: '2023-06-23', cardCount: 281 }),
  set({
    code: 'ymid',
    name: 'Alchemy: Innistrad',
    releasedAt: '2021-12-09',
    setType: 'alchemy',
    cardCount: 63,
    digital: true,
  }),
  set({ code: 'hml', name: 'Homelands', releasedAt: '1995-10-01', cardCount: 140 }),
  set({
    code: 'h2r',
    name: 'Modern Horizons 2 Timeshifts',
    releasedAt: '2024-06-14',
    setType: 'draft_innovation',
    cardCount: 16,
    parent: 'mh3',
  }),
];

describe('set list parsing', () => {
  it('keeps the fields the UI needs and skips broken entries', () => {
    const parsed = parseSets({
      data: [
        {
          object: 'set',
          code: 'MH3',
          name: 'Modern Horizons 3',
          released_at: '2024-06-14',
          set_type: 'draft_innovation',
          card_count: 303,
          digital: false,
          icon_svg_uri: 'https://svgs.scryfall.io/sets/mh3.svg',
          parent_set_code: null,
        },
        { object: 'set', code: 'tmh3', name: 'Tokens', parent_set_code: 'MH3' },
        { object: 'set', name: 'no code' },
        null,
      ],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      code: 'mh3',
      name: 'Modern Horizons 3',
      releasedAt: '2024-06-14',
      setType: 'draft_innovation',
      cardCount: 303,
      digital: false,
      iconUri: 'https://svgs.scryfall.io/sets/mh3.svg',
    });
    expect(parsed[1]?.parent).toBe('mh3');
    expect(parsed[1]?.cardCount).toBe(0);
    expect(parseSets({})).toEqual([]);
    expect(parseSets(null)).toEqual([]);
  });
});

describe('set search', () => {
  it('puts an exact code first, then code and name prefixes', () => {
    expect(searchSets(SETS, 'mh3').map((s) => s.code)).toEqual(['mh3']);
    expect(searchSets(SETS, 'mh').map((s) => s.code)).toEqual(['mh3', 'mh2']);
    expect(searchSets(SETS, 'modern horizons').map((s) => s.code)).toEqual(['mh3', 'mh2', 'h2r', 'tmh3']);
  });

  it('matches words inside the name and plain substrings', () => {
    expect(searchSets(SETS, 'middle').map((s) => s.code)).toEqual(['ltr']);
    expect(searchSets(SETS, 'rings').map((s) => s.code)).toEqual(['ltr']);
    expect(searchSets(SETS, 'nowhere')).toEqual([]);
  });

  it('ranks tokens, digital-only and supplemental sets below the main set', () => {
    expect(searchSets(SETS, 'modern horizons 2').map((s) => s.code)).toEqual(['mh2', 'h2r']);
    expect(searchSets(SETS, 'modern horizons 3').map((s) => s.code)).toEqual(['mh3', 'tmh3']);
    expect(searchSets(SETS, 'alchemy').map((s) => s.code)).toEqual(['ymid']);
  });

  it('lists the newest sets first when nothing is typed, honouring the limit', () => {
    expect(searchSets(SETS, '', 3).map((s) => s.code)).toEqual(['mh3', 'ltr', 'mh2']);
  });

  it('ignores case and diacritics', () => {
    expect(normalize('Tempête')).toBe('tempete');
    expect(searchSets([set({ code: 'tmp', name: 'Tempête' })], 'tempete').map((s) => s.code)).toEqual(['tmp']);
    expect(searchSets(SETS, 'MH3').map((s) => s.code)).toEqual(['mh3']);
  });
});

describe('set helpers', () => {
  it('finds and formats sets', () => {
    expect(findSet(SETS, ' MH2 ')?.name).toBe('Modern Horizons 2');
    expect(findSet(SETS, 'nope')).toBeUndefined();
    expect(setMeta(SETS[0] as SetSummary)).toBe('2024 · 303 cards');
    expect(setMeta(set({ releasedAt: '', cardCount: 1 }))).toBe('1 card');
  });
});
