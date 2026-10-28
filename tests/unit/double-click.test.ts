import { describe, expect, it } from 'vitest';
import { doubleClickRange } from '../../src/lib/double-click';

const selected = (text: string, offset: number) => text.slice(...doubleClickRange(text, offset));

describe('double-click selection', () => {
  it('splits at the colon and other punctuation, as Chrome does', () => {
    expect(selected('t:instant', 4)).toBe('instant');
    expect(selected('t:instant', 0)).toBe('t');
    expect(selected('mv>=3', 3)).toBe('=');
    expect(selected('x-y', 2)).toBe('y');
  });

  it("keeps a word across ' and .", () => {
    expect(selected("kavu's", 2)).toBe("kavu's");
    expect(selected('usd<=1.50', 7)).toBe('1.50');
    expect(selected('a_b', 1)).toBe('a_b');
  });

  it('takes the word when the caret sits on its edge', () => {
    expect(selected('t:instant s:ltr', 9)).toBe('instant');
    expect(selected('t:instant s:ltr', 10)).toBe('s');
    expect(selected('t:instant', 2)).toBe('instant');
    expect(selected('t:instant', 9)).toBe('instant');
  });

  it('selects a run of whitespace, and the unit after a caret between two non-words', () => {
    expect(selected('a  b', 2)).toBe('  ');
    expect(selected('>= <', 2)).toBe(' ');
    expect(selected('', 0)).toBe('');
  });
});
