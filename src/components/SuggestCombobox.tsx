import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { filterSuggestions, type SuggestionGroup, splitLastWord } from '../lib/suggestions';
import { DropdownList } from './Dropdown';

const LIST_HEIGHT = 260;

interface SuggestComboboxProps {
  value: string;
  placeholder: string;
  suggestions: readonly SuggestionGroup[];
  descriptions?: ReadonlyMap<string, string>;
  onInput: (value: string) => void;
}

export function SuggestCombobox({ value, placeholder, suggestions, descriptions, onInput }: SuggestComboboxProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const { head, word } = splitLastWord(value);
  const groups = useMemo(() => filterSuggestions(suggestions, word, descriptions), [suggestions, word, descriptions]);
  const options = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => setActive(-1), [word]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (option: string) => {
    onInput(head + option);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (options.length === 0) return;
      setActive((i) => (event.key === 'ArrowDown' ? (i + 1) % options.length : i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      const option = open ? options[active] : undefined;
      if (!option) return;
      event.preventDefault();
      pick(option);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  let optionIndex = -1;
  return (
    <div class="sqb-combobox" ref={rootRef}>
      <input
        class="sqb-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autocomplete="off"
        value={value}
        placeholder={placeholder}
        onInput={(e) => {
          onInput(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <DropdownList id={listId} anchor={rootRef} preferredHeight={LIST_HEIGHT} listRef={listRef}>
          {groups.map((group) => (
            <li key={group.label} role="presentation">
              <div class="sqb-dropdown-group">{group.label}</div>
              <ul class="sqb-dropdown-sublist" role="group" aria-label={group.label}>
                {group.items.map((option) => {
                  const index = ++optionIndex;
                  return (
                    <li key={option} role="option" aria-selected={index === active}>
                      <button
                        type="button"
                        tabIndex={-1}
                        class={`sqb-option ${index === active ? 'sqb-option-active' : ''}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => pick(option)}
                      >
                        <span class="sqb-option-text">
                          <span class="sqb-option-name">
                            <HighlightedMatch text={option} match={word} />
                          </span>
                          {descriptions?.has(option) && (
                            <span class="sqb-option-description">
                              <HighlightedMatch text={descriptions.get(option)!} match={word} />
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {groups.length === 0 && <li class="sqb-dropdown-note">No matching suggestions</li>}
        </DropdownList>
      )}
    </div>
  );
}

function HighlightedMatch({ text, match }: { text: string; match: string }) {
  const at = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong class="sqb-match">{text.slice(at, at + match.length)}</strong>
      {text.slice(at + match.length)}
    </>
  );
}
