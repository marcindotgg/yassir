import { describe, expect, it } from 'vitest';
import { buildQuery, EMPTY_QUERY, toggleColorOption } from '../../src/lib/scryfall-syntax';

describe('scryfall syntax builder', () => {
  it('builds queries from the form state', () => {
    expect(buildQuery(EMPTY_QUERY)).toBe('');
    expect(buildQuery({ ...EMPTY_QUERY, name: 'Lightning Bolt' })).toBe('name:"Lightning Bolt"');
    expect(buildQuery({ ...EMPTY_QUERY, colors: ['R', 'W'], type: 'instant' })).toBe('t:instant (c<=wr -c:c)');
    expect(buildQuery({ ...EMPTY_QUERY, colorless: true, manaValue: '<=3' })).toBe('c=c mv<=3');
    expect(buildQuery({ ...EMPTY_QUERY, rarity: ['rare', 'mythic'], format: 'commander' })).toBe(
      '(r:rare or r:mythic) f:commander',
    );
    expect(buildQuery({ ...EMPTY_QUERY, rulesText: 'draw "a card"', priceMax: '1.5', priceCurrency: 'eur' })).toBe(
      'o:draw o:"a card" eur<=1.5',
    );
    expect(
      buildQuery({ ...EMPTY_QUERY, power: '>=4', year: '2020', flags: ['foil'], order: 'eur', direction: 'asc' }),
    ).toBe('pow>=4 year=2020 is:foil order:eur direction:asc');
  });

  it('builds one color exactly, several at most without colorless, and an or-group for combinations', () => {
    const q = (s: Partial<typeof EMPTY_QUERY>) => buildQuery({ ...EMPTY_QUERY, ...s });
    expect(q({ colors: ['R'] })).toBe('c=r');
    expect(q({ colors: ['R', 'U'] })).toBe('(c<=ur -c:c)');
    expect(q({ colorCombos: ['izzet'] })).toBe('c=izzet');
    expect(q({ colorCombos: ['orzhov', 'izzet'] })).toBe('(c=orzhov or c=izzet)');
    expect(q({ colorless: true, colors: ['R'], colorCombos: ['izzet'] })).toBe('c=c');
  });

  it('keeps the three kinds of color pick mutually exclusive', () => {
    const none = { colors: [], colorless: false, colorCombos: [] };
    const red = toggleColorOption(none, { kind: 'color', value: 'R' });
    expect(red).toEqual({ ...none, colors: ['R'] });
    expect(toggleColorOption(red, { kind: 'color', value: 'U' }).colors).toEqual(['R', 'U']);
    expect(toggleColorOption(red, { kind: 'color', value: 'R' })).toEqual(none);
    const izzet = toggleColorOption(red, { kind: 'combo', value: 'izzet' });
    expect(izzet).toEqual({ ...none, colorCombos: ['izzet'] });
    expect(toggleColorOption(izzet, { kind: 'combo', value: 'boros' }).colorCombos).toEqual(['izzet', 'boros']);
    const colorless = toggleColorOption(izzet, { kind: 'colorless' });
    expect(colorless).toEqual({ ...none, colorless: true });
    expect(toggleColorOption(colorless, { kind: 'color', value: 'G' })).toEqual({ ...none, colors: ['G'] });
    expect(toggleColorOption(colorless, { kind: 'combo', value: 'jund' })).toEqual({ ...none, colorCombos: ['jund'] });
    expect(toggleColorOption(colorless, { kind: 'colorless' })).toEqual(none);
  });

  it('groups several sets with or, and lower-cases codes', () => {
    expect(buildQuery({ ...EMPTY_QUERY, sets: ['mh3'] })).toBe('s:mh3');
    expect(buildQuery({ ...EMPTY_QUERY, sets: ['MH3', 'ltr'] })).toBe('(s:mh3 or s:ltr)');
    expect(buildQuery({ ...EMPTY_QUERY, sets: ['mh3'], rarity: ['rare'] })).toBe('r:rare s:mh3');
  });
});
