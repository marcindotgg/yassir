import { describe, expect, it } from 'vitest';
import { TAG_DESCRIPTIONS, TAG_GROUPS } from '../../src/lib/tag-suggestions';
import { filterSuggestions } from '../../src/lib/suggestions';

describe('oracle tag suggestions', () => {
  it('lists each tag once, as a slug otag: accepts', () => {
    const all = TAG_GROUPS.flatMap((g) => g.items);
    expect(new Set(all).size).toBe(all.length);
    for (const tag of all) expect(tag).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('describes every tag in at most 64 characters', () => {
    const all = TAG_GROUPS.flatMap((g) => g.items);
    expect(TAG_DESCRIPTIONS.size).toBe(all.length);
    for (const [tag, description] of TAG_DESCRIPTIONS) expect(description.length, tag).toBeLessThanOrEqual(64);
  });

  it('matches anywhere in the tag and keeps the group order', () => {
    const [removal] = filterSuggestions(TAG_GROUPS, 'removal');
    expect(removal!.label).toBe('Removal');
    expect(removal!.items).toContain('spot-removal');
    expect(removal!.items).not.toContain('removal');
    expect(filterSuggestions(TAG_GROUPS, 'ROCK').flatMap((g) => g.items)).toEqual(['mana-rock']);
  });
});
