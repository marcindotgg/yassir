import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { capitalize } from '../lib/query-dictionary';
import {
  COLOR_COMBO_GROUPS,
  COLORS,
  type ColorOption,
  type ColorSelection,
  toggleColorOption,
} from '../lib/scryfall-syntax';
import { DropdownList } from './Dropdown';
import { cycleIndex, useCursor } from './useCursor';

interface ColorSelectProps {
  value: ColorSelection;
  onChange: (next: ColorSelection) => void;
}

interface ColorItem {
  option: ColorOption;
  group: string;
  label: string;
  letters: string;
  searchText: string;
}

interface ColorGroup {
  label: string;
  rows: { item: ColorItem; index: number }[];
}

const LIST_HEIGHT = 340;
const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' } as const;
const GRADIENTS: Record<string, [light: string, dark: string]> = {
  W: ['#fffdf0', '#d8cf98'],
  U: ['#b4d6f2', '#3d78b0'],
  B: ['#8a7f78', '#221d1a'],
  R: ['#ffb08f', '#c23f22'],
  G: ['#a5d69f', '#347a3a'],
};
const COLORLESS_GRADIENT: [light: string, dark: string] = ['#e6e3e0', '#9a9590'];
const GLOSS =
  'radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0) 55%, rgba(0, 0, 0, 0.25))';

const ITEMS: readonly ColorItem[] = [
  ...COLORS.map(
    (color): ColorItem => ({
      option: { kind: 'color', value: color },
      group: 'Colors',
      label: COLOR_NAMES[color],
      letters: color,
      searchText: `${COLOR_NAMES[color]} ${color} colors`.toLowerCase(),
    }),
  ),
  {
    option: { kind: 'colorless' },
    group: 'Colors',
    label: 'Colorless',
    letters: 'C',
    searchText: 'colorless c colors',
  },
  ...COLOR_COMBO_GROUPS.flatMap((group) =>
    group.combos.map(
      (combo): ColorItem => ({
        option: { kind: 'combo', value: combo.name },
        group: group.label,
        label: capitalize(combo.name),
        letters: combo.colors,
        searchText: `${combo.name} ${combo.colors} ${group.label}`.toLowerCase(),
      }),
    ),
  ),
];

export function ColorSelect({ value, onChange }: ColorSelectProps) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? ITEMS.filter((item) => item.searchText.includes(query)) : ITEMS;
  }, [filter]);
  const selected = ITEMS.filter((item) => isSelected(value, item));
  const [active, setActive] = useCursor(filter, 0);

  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!open || !list || !row) return;
    if (active === 0) list.scrollTop = 0;
    else scrollRowIntoView(list, row);
  }, [active, open]);

  const toggle = (item: ColorItem) => {
    onChange(toggleColorOption(value, item.option));
    setFilter('');
    inputRef.current?.focus();
  };

  const openFromBox = (event: MouseEvent) => {
    if (event.target !== inputRef.current) {
      event.preventDefault();
      inputRef.current?.focus();
    }
    setOpen(true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (!open) setOpen(true);
      else if (visible.length > 0) setActive(cycleIndex(active, step, visible.length));
    } else if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      const item = visible[active];
      if (item) toggle(item);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Backspace' && filter === '') {
      const last = selected.at(-1);
      if (last) onChange(toggleColorOption(value, last.option));
    }
  };

  return (
    <div class="sqb-field">
      <span class="sqb-label">Colors</span>
      <div class="sqb-multiselect">
        <div ref={boxRef} class="sqb-multiselect-box" onMouseDown={openFromBox}>
          {selected.map((item) => (
            <span key={item.label} class="sqb-chip">
              <ColorPie letters={item.letters} size="sm" />
              {item.label}
              <button
                type="button"
                class="sqb-chip-remove"
                aria-label={`Remove ${item.label}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => toggle(item)}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            class="sqb-multiselect-input"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autocomplete="off"
            placeholder={selected.length === 0 ? 'Any color' : ''}
            value={filter}
            onInput={(e) => {
              setFilter(e.currentTarget.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          <span class="sqb-multiselect-caret" aria-hidden="true">
            ▾
          </span>
        </div>

        {open && (
          <DropdownList
            id={listId}
            anchor={boxRef}
            preferredHeight={LIST_HEIGHT}
            class="sqb-multiselect-list"
            listRef={listRef}
            multiselectable
          >
            {groupRows(visible).map((group) => (
              <li key={group.label} class="sqb-multiselect-group" role="group" aria-label={group.label}>
                <div class="sqb-multiselect-group-label">{group.label}</div>
                {group.rows.map(({ item, index }) => {
                  const picked = isSelected(value, item);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="option"
                      aria-selected={picked}
                      data-index={index}
                      class={`sqb-option ${index === active ? 'sqb-option-active' : ''} ${picked ? 'sqb-option-selected' : ''}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => toggle(item)}
                    >
                      <ColorPie letters={item.letters} size="lg" />
                      <span class="sqb-option-name">{item.label}</span>
                      <span class="sqb-option-code">{item.letters}</span>
                    </button>
                  );
                })}
              </li>
            ))}
            {visible.length === 0 && <li class="sqb-dropdown-note">No color matches “{filter.trim()}”.</li>}
          </DropdownList>
        )}
      </div>
    </div>
  );
}

function ColorPie({ letters, size }: { letters: string; size: 'sm' | 'lg' }) {
  return <span class={`sqb-pie sqb-pie-${size}`} style={{ background: pieBackground(letters) }} aria-hidden="true" />;
}

function pieBackground(letters: string): string {
  const gradients = letters.split('').map((letter) => GRADIENTS[letter] ?? COLORLESS_GRADIENT);
  const [only] = gradients;
  if (gradients.length === 1 && only) return `radial-gradient(circle at 50% 20%, ${only[0]}, ${only[1]})`;
  const step = 360 / gradients.length;
  const slices = gradients.map(
    ([light, dark], i) => `color-mix(in srgb, ${light}, ${dark}) ${i * step}deg ${(i + 1) * step}deg`,
  );
  return `${GLOSS}, conic-gradient(${slices.join(', ')})`;
}

function isSelected(selection: ColorSelection, { option }: ColorItem): boolean {
  switch (option.kind) {
    case 'color':
      return selection.colors.includes(option.value);
    case 'colorless':
      return selection.colorless;
    case 'combo':
      return selection.colorCombos.includes(option.value);
  }
}

function groupRows(items: readonly ColorItem[]): ColorGroup[] {
  const groups: ColorGroup[] = [];
  items.forEach((item, index) => {
    const group = groups.at(-1);
    if (group?.label === item.group) group.rows.push({ item, index });
    else groups.push({ label: item.group, rows: [{ item, index }] });
  });
  return groups;
}

/** Scrolls the list itself, never the modal around it; a group's first row brings the group label along. */
function scrollRowIntoView(list: HTMLElement, row: HTMLElement) {
  const isFirstInGroup = row.previousElementSibling?.classList.contains('sqb-multiselect-group-label');
  const top = isFirstInGroup ? (row.parentElement as HTMLElement).offsetTop : row.offsetTop;
  const bottom = row.offsetTop + row.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}
