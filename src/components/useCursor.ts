import { useState } from 'preact/hooks';

/** An index that falls back to `initial` whenever `key` changes, e.g. the active option of a filtered list. */
export function useCursor<K>(key: K, initial: number): [number, (index: number) => void] {
  const [cursor, setCursor] = useState({ key, index: initial });
  // Reset during render rather than in an effect, so no frame shows an index into the previous list.
  // Storing the new key also keeps an index from coming back when the key returns to an earlier value.
  if (cursor.key !== key) setCursor({ key, index: initial });
  const index = cursor.key === key ? cursor.index : initial;
  return [index, (next) => setCursor({ key, index: next })];
}
