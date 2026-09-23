import { describe, expect, it } from 'vitest';
import { buildQuery, EMPTY_QUERY, explainQuery } from '../../src/lib/scryfall-syntax';

describe('scryfall syntax builder', () => {
  it('builds queries from the form state', () => {
    expect(buildQuery(EMPTY_QUERY)).toBe('');
    expect(buildQuery({ ...EMPTY_QUERY, name: 'Lightning Bolt' })).toBe('name:"Lightning Bolt"');
    expect(buildQuery({ ...EMPTY_QUERY, colors: ['R', 'W'], colorMode: 'exact', type: 'instant' })).toBe('t:instant c=wr');
    expect(buildQuery({ ...EMPTY_QUERY, colorless: true, manaValue: '3', manaValueOp: '<=' })).toBe('c:c mv<=3');
    expect(buildQuery({ ...EMPTY_QUERY, rarity: ['rare', 'mythic'], format: 'commander' })).toBe('(r:rare or r:mythic) f:commander');
    expect(buildQuery({ ...EMPTY_QUERY, text: 'draw "a card"', priceMax: '1.5', priceCurrency: 'eur' })).toBe('o:draw o:"a card" eur<=1.5');
    expect(buildQuery({ ...EMPTY_QUERY, power: '>=4', year: '2020', flags: ['foil'], order: 'eur', direction: 'asc' })).toBe('pow>=4 year=2020 is:foil order:eur direction:asc');
  });

  it('groups several sets with or, and lower-cases codes', () => {
    expect(buildQuery({ ...EMPTY_QUERY, sets: ['mh3'] })).toBe('s:mh3');
    expect(buildQuery({ ...EMPTY_QUERY, sets: ['MH3', 'ltr'] })).toBe('(s:mh3 or s:ltr)');
    expect(buildQuery({ ...EMPTY_QUERY, sets: ['mh3'], rarity: ['rare'] })).toBe('r:rare s:mh3');
  });

  it('explains common tokens and flags unknown ones', () => {
    const out = explainQuery('c<=wu -t:creature o:"draw a card" mv>=3 foo:bar bolt');
    expect(out.map((e) => e.known)).toEqual([true, true, true, true, false, true]);
    expect(out[0]?.text).toContain('at most');
    expect(out[1]?.text.startsWith('NOT: ')).toBe(true);
    expect(out[2]?.text).toContain('draw a card');
    expect(out[5]?.text).toContain('name contains');
  });

  it('names sets in the explanation when the set list is known', () => {
    const names = new Map([['mh3', 'Modern Horizons 3']]);
    expect(explainQuery('s:MH3', names)[0]?.text).toBe('set is Modern Horizons 3 (mh3)');
    expect(explainQuery('e:xyz', names)[0]?.text).toBe('set is “xyz”');
    expect(explainQuery('s:mh3')[0]?.text).toBe('set is “mh3”');
  });
});
