export interface SetSummary {
  code: string;
  name: string;
  releasedAt: string;
  setType: string;
  cardCount: number;
  digital: boolean;
  iconUri: string;
  parent?: string;
}

interface ScryfallSet {
  code?: unknown;
  name?: unknown;
  released_at?: unknown;
  set_type?: unknown;
  card_count?: unknown;
  digital?: unknown;
  icon_svg_uri?: unknown;
  parent_set_code?: unknown;
}

const RANK_PENALTY_BY_TYPE: Record<string, number> = {
  token: 2,
  memorabilia: 2,
  minigame: 2,
  treasure_chest: 2,
  vanguard: 2,
  promo: 1,
  alchemy: 1,
  masterpiece: 1,
};

export function parseSets(payload: unknown): SetSummary[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const sets: SetSummary[] = [];
  for (const raw of data as (ScryfallSet | null)[]) {
    const code = asString(raw?.code).toLowerCase();
    const name = asString(raw?.name);
    if (!code || !name) continue;
    const parent = asString(raw?.parent_set_code).toLowerCase();
    sets.push({
      code,
      name,
      releasedAt: asString(raw?.released_at),
      setType: asString(raw?.set_type),
      cardCount: typeof raw?.card_count === 'number' ? raw.card_count : 0,
      digital: raw?.digital === true,
      iconUri: asString(raw?.icon_svg_uri),
      ...(parent ? { parent } : {}),
    });
  }
  return sets;
}

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function searchSets(sets: readonly SetSummary[], query: string, limit = 12): SetSummary[] {
  const normalized = normalize(query);
  const matches = sets.flatMap((set) => {
    const tier = normalized ? matchTier(set, normalized) : 0;
    return tier === null ? [] : [{ set, tier }];
  });
  matches.sort(
    (a, b) =>
      a.tier - b.tier ||
      rankPenalty(a.set) - rankPenalty(b.set) ||
      newestFirst(a.set, b.set) ||
      a.set.name.localeCompare(b.set.name),
  );
  return matches.slice(0, limit).map((match) => match.set);
}

export function findSet(sets: readonly SetSummary[], code: string): SetSummary | undefined {
  const normalized = code.trim().toLowerCase();
  return sets.find((set) => set.code === normalized);
}

export function setMeta(set: SetSummary): string {
  const year = set.releasedAt.slice(0, 4);
  const cards = set.cardCount === 1 ? '1 card' : `${set.cardCount} cards`;
  return [year, cards].filter(Boolean).join(' · ');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function matchTier(set: SetSummary, query: string): number | null {
  const name = normalize(set.name);
  if (set.code === query) return 0;
  if (set.code.startsWith(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (name.split(/[\s:'’-]+/).some((word) => word.startsWith(query))) return 3;
  if (name.includes(query)) return 4;
  return null;
}

function rankPenalty(set: SetSummary): number {
  return (
    (RANK_PENALTY_BY_TYPE[set.setType] ?? 0) +
    (set.parent ? 1 : 0) +
    (set.digital ? 1 : 0) +
    (set.cardCount === 0 ? 1 : 0)
  );
}

function newestFirst(a: SetSummary, b: SetSummary): number {
  if (a.releasedAt === b.releasedAt) return 0;
  return a.releasedAt < b.releasedAt ? 1 : -1;
}
