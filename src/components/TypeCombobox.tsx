import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { splitLastWord, suggestTypes } from '../lib/type-suggestions';
import { useDropdownPlacement } from './useDropdownPlacement';

const LIST_HEIGHT = 260;

function Highlighted({ name, word }: { name: string; word: string }) {
  const at = word ? name.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (at < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, at)}
      <strong class="sqb-ac-hit">{name.slice(at, at + word.length)}</strong>
      {name.slice(at + word.length)}
    </>
  );
}

/**
 * The card-type text field with a dropdown of suggestions for the word being
 * typed. Picking one goes through a real `input` event, so whatever listens to
 * the field sees it as typing.
 */
export function TypeCombobox(props: { value: string; placeholder: string; onInput: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useRef(`sqb-types-${Math.random().toString(36).slice(2, 8)}`).current;

  const { head, word } = splitLastWord(props.value);
  const groups = useMemo(() => suggestTypes(word), [word]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(-1), [word]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (name: string) => {
    const input = inputRef.current;
    if (!input) return;
    input.value = head + name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      if (flat.length === 0) return;
      setActive((i) => (event.key === 'ArrowDown' ? (i + 1) % flat.length : (i <= 0 ? flat.length - 1 : i - 1)));
    } else if (event.key === 'Enter') {
      const picked = open ? flat[active] : undefined;
      if (picked) {
        event.preventDefault();
        pick(picked);
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const placement = useDropdownPlacement(rootRef, open, LIST_HEIGHT);
  let index = -1;

  return (
    <div class="sqb-ac" ref={rootRef}>
      <input
        ref={inputRef}
        class="sqb-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autocomplete="off"
        value={props.value}
        placeholder={props.placeholder}
        onInput={(e) => {
          props.onInput((e.target as HTMLInputElement).value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          ref={listRef}
          id={listId}
          class={`sqb-ac-list ${placement.up ? 'sqb-drop-up' : ''}`}
          style={{ maxHeight: `${placement.maxHeight}px` }}
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
        >
          {groups.map((g) => (
            <li key={g.label} role="presentation">
              <div class="sqb-ac-group">{g.label}</div>
              <ul class="sqb-ac-sub" role="group" aria-label={g.label}>
                {g.items.map((name) => {
                  const i = ++index;
                  return (
                    <li key={name} role="option" aria-selected={i === active} data-active={i === active}>
                      <button
                        type="button"
                        tabIndex={-1}
                        class={`sqb-ac-item ${i === active ? 'sqb-ac-active' : ''}`}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pick(name);
                        }}
                      >
                        <span class="sqb-ac-name">
                          <Highlighted name={name} word={word} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {groups.length === 0 && <li class="sqb-ac-note">No matching suggestions</li>}
        </ul>
      )}
    </div>
  );
}
