import { browser } from '#imports';
import type { SetSummary } from './lib/sets';

export interface SetsResponse {
  sets: SetSummary[];
  /** Epoch ms of the fetch these sets came from; 0 when nothing is cached. */
  fetchedAt: number;
  /** True when the sets are a stale cache served because the refresh failed. */
  stale: boolean;
  error?: string;
}

export interface SetsRequest {
  type: 'sets:list';
  /** Bypasses the freshness check (the “Refresh” link in the set field). */
  force?: boolean;
}

/** Asks the background worker for the Scryfall set list (it owns the cache). */
export async function requestSets(force = false): Promise<SetsResponse> {
  const request: SetsRequest = { type: 'sets:list', force };
  try {
    const response = (await browser.runtime.sendMessage(request)) as SetsResponse | undefined;
    if (!response) return { sets: [], fetchedAt: 0, stale: false, error: 'no response from the background worker' };
    return response;
  } catch (err) {
    return { sets: [], fetchedAt: 0, stale: false, error: err instanceof Error ? err.message : String(err) };
  }
}
