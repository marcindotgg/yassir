import { useCallback, useEffect, useState } from 'preact/hooks';
import type { SetSummary } from '../lib/sets';
import { requestSets } from '../messaging';
import type { SetsStatus } from './SetAutocomplete';

interface SetsState {
  sets: SetSummary[];
  status: SetsStatus;
  error?: string;
}

/**
 * The Scryfall set list, fetched and cached by the background worker. A stale
 * cache still counts as ready — the dropdown works, it is just a day behind.
 */
export function useSets(): SetsState & { reload: () => void } {
  const [state, setState] = useState<SetsState>({ sets: [], status: 'loading' });

  const load = useCallback((force: boolean) => {
    setState((s) => ({ ...s, status: 'loading' }));
    void requestSets(force).then((res) => {
      if (res.sets.length > 0) setState({ sets: res.sets, status: 'ready' });
      else setState({ sets: [], status: 'error', ...(res.error ? { error: res.error } : {}) });
    });
  }, []);

  useEffect(() => load(false), [load]);

  return { ...state, reload: () => load(true) };
}
