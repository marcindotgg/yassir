// The set list behind the autocomplete: the slice of Scryfall's /sets payload we
// keep, plus pure parsing/search helpers. No DOM, no fetch — unit-tested.

export interface SetSummary {
  /** Scryfall set code, lower-case — this is what goes into `s:`. */
  code: string;
  name: string;
  /** ISO date, '' when Scryfall has not dated the set yet. */
  releasedAt: string;
  setType: string;
  cardCount: number;
  digital: boolean;
  iconUri: string;
  /** Parent set code for tokens, promos and masterpieces. */
  parent?: string;
}

/** Shape of one entry in `https://api.scryfall.com/sets`; only the fields we read. */
interface ScryfallSet {
  object?: string;
  code?: unknown;
  name?: unknown;
  released_at?: unknown;
  set_type?: unknown;
  card_count?: unknown;
  digital?: unknown;
  icon_svg_uri?: unknown;
  parent_set_code?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Keeps only the fields the UI needs; bad entries are skipped, not thrown on. */
export function parseSets(payload: unknown): SetSummary[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: SetSummary[] = [];
  for (const raw of data as ScryfallSet[]) {
    const code = str(raw?.code).toLowerCase();
    const name = str(raw?.name);
    if (!code || !name) continue;
    const parent = str(raw?.parent_set_code).toLowerCase();
    out.push({
      code,
      name,
      releasedAt: str(raw?.released_at),
      setType: str(raw?.set_type),
      cardCount: typeof raw?.card_count === 'number' ? raw.card_count : 0,
      digital: raw?.digital === true,
      iconUri: str(raw?.icon_svg_uri),
      ...(parent ? { parent } : {}),
    });
  }
  return out;
}

/** Lower-case, diacritics stripped: “Tempête” and “Tempete” must match. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Sets people search for come first when everything else ties. Tokens, promos
// and memorabilia are real answers but rarely the intended one, and neither is a
// supplemental sheet hanging off a main set (Scryfall gives those a parent:
// 'Modern Horizons 2 Timeshifts' must not outrank 'Modern Horizons 3').
const TYPE_PENALTY: Record<string, number> = {
  token: 2,
  memorabilia: 2,
  minigame: 2,
  promo: 1,
  alchemy: 1,
  masterpiece: 1,
  treasure_chest: 2,
  vanguard: 2,
};

function penalty(set: SetSummary): number {
  return (TYPE_PENALTY[set.setType] ?? 0) + (set.parent ? 1 : 0) + (set.digital ? 1 : 0) + (set.cardCount === 0 ? 1 : 0);
}

/**
 * Ranks sets for a typed fragment: exact code, then code prefix, then name
 * prefix, then a word inside the name, then any substring. Ties break on the
 * set kind (tokens/promos last) and then on the release date, newest first.
 * An empty query lists the newest sets, which is what the dropdown opens on.
 */
export function searchSets(sets: readonly SetSummary[], query: string, limit = 12): SetSummary[] {
  const q = normalize(query);
  const scored: { set: SetSummary; tier: number }[] = [];

  for (const set of sets) {
    if (!q) {
      scored.push({ set, tier: 0 });
      continue;
    }
    const code = set.code;
    const name = normalize(set.name);
    let tier: number;
    if (code === q) tier = 0;
    else if (code.startsWith(q)) tier = 1;
    else if (name.startsWith(q)) tier = 2;
    else if (name.split(/[\s:'’-]+/).some((word) => word.startsWith(q))) tier = 3;
    else if (name.includes(q)) tier = 4;
    else continue;
    scored.push({ set, tier });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const pa = penalty(a.set);
    const pb = penalty(b.set);
    if (pa !== pb) return pa - pb;
    if (a.set.releasedAt !== b.set.releasedAt) return a.set.releasedAt < b.set.releasedAt ? 1 : -1;
    return a.set.name.localeCompare(b.set.name);
  });

  return scored.slice(0, limit).map((s) => s.set);
}

export function findSet(sets: readonly SetSummary[], code: string): SetSummary | undefined {
  const c = code.trim().toLowerCase();
  return sets.find((s) => s.code === c);
}

/** “2024 · 303 cards” — the dim right-hand side of a dropdown row. */
export function setMeta(set: SetSummary): string {
  const year = set.releasedAt.slice(0, 4);
  const cards = set.cardCount === 1 ? '1 card' : `${set.cardCount} cards`;
  return [year, cards].filter(Boolean).join(' · ');
}
