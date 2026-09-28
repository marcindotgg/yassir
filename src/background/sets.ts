import { storage } from '#imports';
import { parseSets, type SetSummary } from '../lib/sets';
import { errorMessage, type SetsResponse } from '../messaging';

const SETS_URL = 'https://api.scryfall.com/sets';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 10;

interface SetsCache {
  fetchedAt: number;
  sets: SetSummary[];
}

interface SetsPage {
  data?: unknown;
  has_more?: boolean;
  next_page?: string;
}

const setsCache = storage.defineItem<SetsCache>('local:setsCache', {
  fallback: { fetchedAt: 0, sets: [] },
});

let inFlight: Promise<SetsCache> | null = null;

export async function getSets(force = false): Promise<SetsResponse> {
  const cached = await setsCache.getValue();
  const fresh = cached.sets.length > 0 && Date.now() - cached.fetchedAt < MAX_AGE_MS;
  if (fresh && !force) return { sets: cached.sets };

  inFlight ??= fetchAllSets()
    .then(async (fetched) => {
      await setsCache.setValue(fetched);
      return fetched;
    })
    .finally(() => {
      inFlight = null;
    });

  try {
    return { sets: (await inFlight).sets };
  } catch (err) {
    return { sets: cached.sets, error: errorMessage(err) };
  }
}

async function fetchAllSets(): Promise<SetsCache> {
  const sets: SetSummary[] = [];
  let url: string | undefined = SETS_URL;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const body = await fetchPage(url);
    sets.push(...parseSets(body));
    url = body.has_more ? body.next_page : undefined;
  }
  if (sets.length === 0) throw new Error('Scryfall returned no sets');
  return { fetchedAt: Date.now(), sets };
}

async function fetchPage(url: string): Promise<SetsPage> {
  // Scryfall asks for a descriptive User-Agent, which fetch() can't set; the browser's own is accepted.
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Scryfall responded ${response.status}`);
  return (await response.json()) as SetsPage;
}
