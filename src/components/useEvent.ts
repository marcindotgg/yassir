import { useCallback, useRef } from 'preact/hooks';

/** A stable function that always calls the latest `fn`, so effects can use it without re-subscribing. */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args: A) => latest.current(...args), []);
}
