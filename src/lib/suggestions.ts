export interface SuggestionGroup {
  label: string;
  items: readonly string[];
}

export function splitLastWord(text: string): { head: string; word: string } {
  const cut = text.lastIndexOf(' ') + 1;
  return { head: text.slice(0, cut), word: text.slice(cut) };
}

export function filterSuggestions(
  groups: readonly SuggestionGroup[],
  word: string,
  descriptions?: ReadonlyMap<string, string>,
): SuggestionGroup[] {
  const query = word.toLowerCase();
  return groups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => {
        const lower = item.toLowerCase();
        if (lower === query) return false;
        return lower.includes(query) || !!descriptions?.get(item)?.toLowerCase().includes(query);
      }),
    }))
    .filter((group) => group.items.length > 0);
}
