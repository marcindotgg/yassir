import { browser } from '#imports';
import type { SetSummary } from './lib/sets';

export interface SetsRequest {
  type: 'sets:list';
  force?: boolean;
}

export interface SetsResponse {
  sets: SetSummary[];
  error?: string;
}

export async function requestSets(force = false): Promise<SetsResponse> {
  const request: SetsRequest = { type: 'sets:list', force };
  try {
    const response = (await browser.runtime.sendMessage(request)) as SetsResponse | undefined;
    return response ?? { sets: [], error: 'no response from the background worker' };
  } catch (err) {
    return { sets: [], error: errorMessage(err) };
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
