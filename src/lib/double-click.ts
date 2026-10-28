// Chrome's units for a double-click in a text field: words, joined across ' and . as in "kavu's" or
// "1.50"; runs of whitespace; and every other character on its own. Unlike Intl.Segmenter's words,
// these end at a colon, so "t:instant" is three units.
const UNITS = /[\p{L}\p{N}\p{M}_]+(?:['’.][\p{L}\p{N}\p{M}_]+)*|\s+|[\s\S]/gu;
const WORD = /[\p{L}\p{N}_]/u;

/**
 * What a double-click selects, given the caret its first click left at `offset`. A caret on the edge
 * of a word takes the word: the click landed on one of its letters or just beside it.
 */
export function doubleClickRange(text: string, offset: number): [number, number] {
  let before: [number, number] | null = null;
  for (const unit of text.matchAll(UNITS)) {
    const start = unit.index;
    const end = start + unit[0].length;
    if (end < offset) continue;
    if (end === offset) {
      before = [start, end];
      continue;
    }
    if (start < offset) return [start, end];
    return WORD.test(unit[0]) || !before || !WORD.test(text.slice(...before)) ? [start, end] : before;
  }
  return before ?? [offset, offset];
}
