import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { findSet, searchSets, setMeta, type SetSummary } from '../lib/sets';
import { useDropdownPlacement } from './useDropdownPlacement';

export type SetsStatus = 'loading' | 'ready' | 'error';

export interface SetAutocompleteProps {
  /** The full Scryfall set list, from the background cache. */
  sets: readonly SetSummary[];
  status: SetsStatus;
  error?: string;
  /** Picked set codes, lower-case. */
  selected: readonly string[];
  onChange: (codes: string[]) => void;
  onRetry: () => void;
}

const MAX_SUGGESTIONS = 12;
const LIST_HEIGHT = 260;

/**
 * Type a set name or code, pick from the dropdown, keep as many as you like.
 * The codes go into the query as `s:mh3` (or `(s:mh3 or s:ltr)`).
 */
export function SetAutocomplete(props: SetAutocompleteProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listId = useRef(`sqb-sets-${Math.random().toString(36).slice(2, 8)}`).current;

  const suggestions = useMemo(() => {
    const picked = new Set(props.selected);
    return searchSets(props.sets, text, MAX_SUGGESTIONS + picked.size)
      .filter((s) => !picked.has(s.code))
      .slice(0, MAX_SUGGESTIONS);
  }, [props.sets, props.selected, text]);

  useEffect(() => setActive(0), [text]);

  const add = (code: string) => {
    const c = code.trim().toLowerCase();
    if (!c || props.selected.includes(c)) return;
    props.onChange([...props.selected, c]);
    setText('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (code: string) => props.onChange(props.selected.filter((c) => c !== code));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) setOpen(true);
      if (suggestions.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Enter') {
      // Never let Enter reach Scryfall's own search form while picking a set.
      event.preventDefault();
      const picked = suggestions[active];
      if (picked) add(picked.code);
      else if (text.trim()) add(text);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Backspace' && text === '' && props.selected.length > 0) {
      remove(props.selected[props.selected.length - 1] as string);
    }
  };

  const showList = open && (suggestions.length > 0 || props.status !== 'ready' || text.trim() !== '');
  const placement = useDropdownPlacement(anchorRef, showList, LIST_HEIGHT);

  return (
    <div class="sqb-field sqb-field-wide">
      <span class="sqb-label">Sets (s:)</span>

      {props.selected.length > 0 && (
        <div class="sqb-wrap">
          {props.selected.map((code) => {
            const set = findSet(props.sets, code);
            return (
              <span key={code} class="sqb-chip">
                {set?.iconUri && <img class="sqb-set-icon" src={set.iconUri} alt="" loading="lazy" />}
                {set?.name ?? code}
                <span class="sqb-ac-code">{code}</span>
                <button type="button" class="sqb-chip-remove" aria-label={`Remove ${set?.name ?? code}`} onClick={() => remove(code)}>
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div class="sqb-ac" ref={anchorRef}>
        <input
          ref={inputRef}
          class="sqb-input"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autocomplete="off"
          placeholder={props.status === 'loading' ? 'Loading sets…' : 'Modern Horizons 3, mh3…'}
          value={text}
          onInput={(e) => {
            setText((e.target as HTMLInputElement).value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />

        {showList && (
          // mousedown default would blur the input and close the list before the click lands.
          <ul
            class={`sqb-ac-list ${placement.up ? 'sqb-drop-up' : ''}`}
            style={{ maxHeight: `${placement.maxHeight}px` }}
            id={listId}
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
          >
            {props.status === 'loading' && suggestions.length === 0 && <li class="sqb-ac-note">Loading the set list from Scryfall…</li>}

            {props.status === 'error' && (
              <li class="sqb-ac-note">
                Could not load the set list{props.error ? `: ${props.error}` : ''}.{' '}
                <button type="button" class="sqb-btn sqb-btn-sm sqb-btn-ghost" onClick={props.onRetry}>
                  Retry
                </button>
              </li>
            )}

            {suggestions.map((set, i) => (
              <li key={set.code} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  class={`sqb-ac-item ${i === active ? 'sqb-ac-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(set.code)}
                >
                  {set.iconUri ? <img class="sqb-set-icon" src={set.iconUri} alt="" loading="lazy" /> : <span class="sqb-set-icon" />}
                  <span class="sqb-ac-name">{set.name}</span>
                  <span class="sqb-ac-code">{set.code}</span>
                  <span class="sqb-ac-meta">{setMeta(set)}</span>
                </button>
              </li>
            ))}

            {props.status === 'ready' && suggestions.length === 0 && text.trim() !== '' && (
              <li class="sqb-ac-note">
                No set matches “{text.trim()}”. Press Enter to use it as a code anyway.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
