import { useCallback, useEffect, useState } from 'preact/hooks';
import type { SetSummary } from '../lib/sets';
import { requestSets } from '../messaging';

export interface SetList {
  sets: SetSummary[];
  status: 'loading' | 'ready' | 'error';
  error?: string;
  reload: () => void;
}

export function useSets(): SetList {
  const [state, setState] = useState<Omit<SetList, 'reload'>>({ sets: [], status: 'loading' });

  const load = useCallback((force: boolean) => {
    setState((current) => ({ ...current, status: 'loading' }));
    void requestSets(force).then(({ sets, error }) => {
      setState(sets.length > 0 ? { sets, status: 'ready' } : { sets: [], status: 'error', error });
    });
  }, []);

  useEffect(() => load(false), [load]);

  return { ...state, reload: () => load(true) };
}
