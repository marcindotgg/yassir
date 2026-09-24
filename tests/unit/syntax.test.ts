import { describe, expect, it } from 'vitest';
import { buildQuery, EMPTY_QUERY, explainQuery, toggleColorOption } from '../../src/lib/scryfall-syntax';

describe('scryfall syntax builder', () => {
  it('builds queries from the form state', () => {
    expect(buildQuery(EMPTY_QUERY)).toBe('');
    expect(buildQuery({ ...EMPTY_QUERY, name: 'Lightning Bolt' })).toBe('name:"Lightning Bolt"');
    expect(buildQuery({ ...EMPTY_QUERY, colors: ['R', 'W'], type: 'instant' })).toBe('t:instant c<=wr');
    expect(buildQuery({ ...EMPTY_QUERY, colorless: true, manaValue: '3', manaValueOp: '<=' })).toBe('c:c mv<=3');
    expect(buildQuery({ ...EMPTY_QUERY, rarity: ['rare', 'mythic'], format: 'commander' })).toBe('(r:rare or r:mythic) f:commander');
    expect(buildQuery({ ...EMPTY_QUERY, text: 'draw "a card"', priceMax: '1.5', priceCurrency: 'eur' })).toBe('o:draw o:"a card" eur<=1.5');
    expect(buildQuery({ ...EMPTY_QUERY, power: '>=4', year: '2020', flags: ['foil'], order: 'eur', direction: 'asc' })).toBe('pow>=4 year=2020 is:foil order:eur direction:asc');
  });

  it('builds "at most" for single colors and an or-group for combinations', () => {
    const q = (s: Partial<typeof EMPTY_QUERY>) => buildQuery({ ...EMPTY_QUERY, ...s });
    expect(q({ colors: ['U', 'R'] })).toBe('c<=ur');
    expect(q({ colorCombos: ['izzet'] })).toBe('c=izzet');
    expect(q({ colorCombos: ['orzhov', 'izzet'] })).toBe('(c=orzhov or c=izzet)');
    // Colorless overrides everything else in the field.
    expect(q({ colorless: true, colors: ['R'], colorCombos: ['izzet'] })).toBe('c:c');
  });

  it('keeps the three kinds of color pick mutually exclusive', () => {
    const none = { colors: [], colorless: false, colorCombos: [] };
    const red = toggleColorOption(none, { kind: 'color', value: 'R' });
    expect(red).toEqual({ ...none, colors: ['R'] });
    // Single colors accumulate…
    expect(toggleColorOption(red, { kind: 'color', value: 'U' }).colors).toEqual(['R', 'U']);
    // …and toggle off again.
    expect(toggleColorOption(red, { kind: 'color', value: 'R' })).toEqual(none);
    // A combination clears the colors; several combinations accumulate.
    const izzet = toggleColorOption(red, { kind: 'combo', value: 'izzet' });
    expect(izzet).toEqual({ ...none, colorCombos: ['izzet'] });
    expect(toggleColorOption(izzet, { kind: 'combo', value: 'boros' }).colorCombos).toEqual(['izzet', 'boros']);
    // Colorless clears both; a color or combination clears colorless.
    const colorless = toggleColorOption(izzet, { kind: 'colorless' });
    expect(colorless).toEqual({ ...none, colorless: true });
    expect(toggleColorOption(colorless, { kind: 'color', value: 'G' })).toEqual({ ...none, colors: ['G'] });
    expect(toggleColorOption(colorless, { kind: 'combo', value: 'jund' })).toEqual({ ...none, colorCombos: ['jund'] });
    expect(toggleColorOption(colorless, { kind: 'colorless' })).toEqual(none);
  });

  it('explains color nicknames instead of spelling them out letter by letter', () => {
    expect(explainQuery('c>=izzet')[0]?.text).toBe('colors at least izzet (blue + red)');
    expect(explainQuery('id<=Jund')[0]?.text).toBe('color identity at most jund (black + red + green)');
    expect(explainQuery('c:quandrix')[0]?.text).toBe('colors includes quandrix (green + blue)');
    expect(explainQuery('c=rainbow')[0]?.text).toBe('colors exactly rainbow (white + blue + black + red + green)');
    expect(explainQuery('c=rg')[0]?.text).toBe('colors exactly red + green');
    expect(explainQuery('c:m')[0]?.text).toBe('colors includes multicolor');
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
