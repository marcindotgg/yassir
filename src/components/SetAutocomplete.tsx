import { useId, useMemo, useRef, useState } from 'preact/hooks';
import { findSet, searchSets, setMeta } from '../lib/sets';
import { DropdownList } from './Dropdown';
import { useCursor } from './useCursor';
import type { SetList } from './useSets';

interface SetAutocompleteProps {
  setList: SetList;
  selected: readonly string[];
  onChange: (codes: string[]) => void;
}

const MAX_SUGGESTIONS = 12;
const LIST_HEIGHT = 260;

export function SetAutocomplete({ setList, selected, onChange }: SetAutocompleteProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { sets, status } = setList;

  const suggestions = useMemo(() => {
    const picked = new Set(selected);
    return searchSets(sets, text, MAX_SUGGESTIONS + picked.size)
      .filter((set) => !picked.has(set.code))
      .slice(0, MAX_SUGGESTIONS);
  }, [sets, selected, text]);

  // Nothing is highlighted over an empty field, so Enter there submits the form instead of adding a set.
  const [active, setActive] = useCursor(text, text.trim() ? 0 : -1);

  const add = (code: string) => {
    const normalized = code.trim().toLowerCase();
    if (!normalized || selected.includes(normalized)) return;
    onChange([...selected, normalized]);
    setText('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (code: string) => onChange(selected.filter((other) => other !== code));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) setOpen(true);
      if (suggestions.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(
        active < 0 && step < 0 ? suggestions.length - 1 : (active + step + suggestions.length) % suggestions.length,
      );
    } else if (event.key === 'Enter') {
      const code = suggestions[active]?.code ?? text;
      if (!code.trim()) return;
      event.preventDefault();
      add(code);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Backspace' && text === '') {
      const last = selected.at(-1);
      if (last) remove(last);
    }
  };

  const showList = open && (suggestions.length > 0 || status !== 'ready' || text.trim() !== '');

  return (
    <div class="sqb-field sqb-sets">
      <span class="sqb-label">Sets (s:)</span>

      {selected.length > 0 && (
        <div class="sqb-wrap">
          {selected.map((code) => {
            const set = findSet(sets, code);
            return (
              <span key={code} class="sqb-chip">
                {set?.iconUri && <img class="sqb-set-icon" src={set.iconUri} alt="" loading="lazy" />}
                {set?.name ?? code}
                <span class="sqb-option-code">{code}</span>
                <button
                  type="button"
                  class="sqb-chip-remove"
                  aria-label={`Remove ${set?.name ?? code}`}
                  onClick={() => remove(code)}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div class="sqb-combobox" ref={anchorRef}>
        <input
          ref={inputRef}
          class="sqb-input"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autocomplete="off"
          placeholder={status === 'loading' ? 'Loading sets…' : 'Modern Horizons 3, mh3…'}
          value={text}
          onInput={(e) => {
            setText(e.currentTarget.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />

        {showList && (
          <DropdownList id={listId} anchor={anchorRef} preferredHeight={LIST_HEIGHT}>
            {status === 'loading' && suggestions.length === 0 && (
              <li class="sqb-dropdown-note">Loading the set list from Scryfall…</li>
            )}

            {status === 'error' && (
              <li class="sqb-dropdown-note">
                Could not load the set list{setList.error ? `: ${setList.error}` : ''}.{' '}
                <button type="button" class="sqb-btn sqb-btn-sm sqb-btn-ghost" onClick={setList.reload}>
                  Retry
                </button>
              </li>
            )}

            {suggestions.map((set, i) => (
              <li key={set.code} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  class={`sqb-option ${i === active ? 'sqb-option-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(set.code)}
                >
                  {set.iconUri ? (
                    <img class="sqb-set-icon" src={set.iconUri} alt="" loading="lazy" />
                  ) : (
                    <span class="sqb-set-icon" />
                  )}
                  <span class="sqb-option-name">{set.name}</span>
                  <span class="sqb-option-code">{set.code}</span>
                  <span class="sqb-option-meta">{setMeta(set)}</span>
                </button>
              </li>
            ))}

            {status === 'ready' && suggestions.length === 0 && text.trim() !== '' && (
              <li class="sqb-dropdown-note">No set matches “{text.trim()}”. Press Enter to use it as a code anyway.</li>
            )}
          </DropdownList>
        )}
      </div>
    </div>
  );
}
