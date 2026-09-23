import { storage } from '#imports';
import { parseSets, type SetSummary } from '../lib/sets';
import type { SetsResponse } from '../messaging';

const SETS_URL = 'https://api.scryfall.com/sets';
/** Scryfall publishes a handful of sets a month; a day-old list is plenty. */
const TTL_MS = 24 * 60 * 60 * 1000;

interface SetsCache {
  fetchedAt: number;
  sets: SetSummary[];
}

export const setsCache = storage.defineItem<SetsCache>('local:setsCache', {
  fallback: { fetchedAt: 0, sets: [] },
});

/** One shared fetch: several tabs opening the builder at once must not fan out. */
let inFlight: Promise<SetsCache> | null = null;

async function fetchSets(): Promise<SetsCache> {
  // Scryfall asks for a descriptive User-Agent, but fetch() forbids setting it;
  // the browser sends its own, which their API accepts. One request a day keeps
  // us far under the published rate limit.
  const res = await fetch(SETS_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
  const payload = (await res.json()) as { data?: unknown; has_more?: boolean; next_page?: string };

  const sets = parseSets(payload);
  // /sets is a single page today; follow next_page anyway if that ever changes.
  let next = payload.has_more === true ? payload.next_page : undefined;
  let guard = 0;
  while (typeof next === 'string' && guard++ < 10) {
    const page = await fetch(next, { headers: { Accept: 'application/json' } });
    if (!page.ok) break;
    const body = (await page.json()) as { data?: unknown; has_more?: boolean; next_page?: string };
    sets.push(...parseSets(body));
    next = body.has_more === true ? body.next_page : undefined;
  }

  if (sets.length === 0) throw new Error('Scryfall returned no sets');
  return { fetchedAt: Date.now(), sets };
}

/**
 * The set list, from `browser.storage.local` when it is fresh enough. A failed
 * refresh falls back to whatever is cached, flagged `stale`, so the dropdown
 * keeps working offline.
 */
export async function getSets(force = false): Promise<SetsResponse> {
  const cached = await setsCache.getValue();
  const fresh = cached.sets.length > 0 && Date.now() - cached.fetchedAt < TTL_MS;
  if (fresh && !force) return { sets: cached.sets, fetchedAt: cached.fetchedAt, stale: false };

  inFlight ??= fetchSets()
    .then(async (next) => {
      await setsCache.setValue(next);
      return next;
    })
    .finally(() => {
      inFlight = null;
    });

  try {
    const next = await inFlight;
    return { sets: next.sets, fetchedAt: next.fetchedAt, stale: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sets: cached.sets, fetchedAt: cached.fetchedAt, stale: cached.sets.length > 0, error: message };
  }
}
