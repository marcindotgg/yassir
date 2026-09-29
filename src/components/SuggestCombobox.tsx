import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { filterSuggestions, type SuggestionGroup, splitLastWord } from '../lib/suggestions';
import { DropdownList } from './Dropdown';
import { cycleIndex, useCursor } from './useCursor';

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
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const { head, word } = splitLastWord(value);
  const groups = useMemo(() => filterSuggestions(suggestions, word, descriptions), [suggestions, word, descriptions]);
  const options = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const [active, setActive] = useCursor(word, -1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the option to scroll to is found by its aria-selected, which follows `active`
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
      setActive(cycleIndex(active, event.key === 'ArrowDown' ? 1 : -1, options.length));
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
            <fieldset key={group.label} class="sqb-dropdown-sublist">
              <legend class="sqb-dropdown-group">{group.label}</legend>
              {group.items.map((option) => {
                const index = ++optionIndex;
                const description = descriptions?.get(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === active}
                    class={`sqb-option ${index === active ? 'sqb-option-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(option)}
                  >
                    <span class="sqb-option-text">
                      <span class="sqb-option-name">
                        <HighlightedMatch text={option} match={word} />
                      </span>
                      {description && (
                        <span class="sqb-option-description">
                          <HighlightedMatch text={description} match={word} />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </fieldset>
          ))}
          {groups.length === 0 && <div class="sqb-dropdown-note">No matching suggestions</div>}
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
