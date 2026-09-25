import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { COLOR_COMBO_GROUPS, COLORS, toggleColorOption, type ColorOption, type ColorSelection } from '../lib/scryfall-syntax';
import { useDropdownPlacement } from './useDropdownPlacement';

export interface ColorSelectProps {
  value: ColorSelection;
  onChange: (next: ColorSelection) => void;
}

interface Item {
  option: ColorOption;
  /** Colors, Guilds, Shards, Wedges, Four colors. */
  group: string;
  label: string;
  /** The colors as letters: `W`, `UR`; `C` for colorless. */
  letters: string;
  /** Lower-case text the filter looks in. */
  haystack: string;
}

/** Light and dark end of each color's gradient, lit from above like the rarity gems. */
const SWATCH: Record<string, [light: string, dark: string]> = {
  W: ['#fffdf0', '#d8cf98'],
  U: ['#b4d6f2', '#3d78b0'],
  B: ['#8a7f78', '#221d1a'],
  R: ['#ffb08f', '#c23f22'],
  G: ['#a5d69f', '#347a3a'],
  C: ['#e6e3e0', '#9a9590'],
};
const NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' } as const;
const LIST_HEIGHT = 340;

const ITEMS: readonly Item[] = [
  ...COLORS.map((c): Item => ({ option: { kind: 'color', value: c }, group: 'Colors', label: NAMES[c], letters: c, haystack: `${NAMES[c]} ${c} colors`.toLowerCase() })),
  { option: { kind: 'colorless' }, group: 'Colors', label: 'Colorless', letters: 'C', haystack: 'colorless c colors' },
  ...COLOR_COMBO_GROUPS.flatMap((g) =>
    g.combos.map((combo): Item => {
      const label = combo.name.charAt(0).toUpperCase() + combo.name.slice(1);
      return { option: { kind: 'combo', value: combo.name }, group: g.label, label, letters: combo.colors, haystack: `${combo.name} ${combo.colors} ${g.label}`.toLowerCase() };
    }),
  ),
];

const isSelected = (sel: ColorSelection, { option }: Item): boolean =>
  option.kind === 'color' ? sel.colors.includes(option.value) : option.kind === 'colorless' ? sel.colorless : sel.colorCombos.includes(option.value);

/** A disc split into equal slices, one per color, in WUBRG order, each shaded light to dark. */
function pie(letters: string): string {
  const colors = letters.split('').map((l) => SWATCH[l] ?? (SWATCH.C as [string, string]));
  if (colors.length === 1) {
    const [light, dark] = colors[0] as [string, string];
    return `radial-gradient(circle at 50% 20%, ${light}, ${dark})`;
  }
  const step = 360 / colors.length;
  // Flat slices in each color's mid tone, with one shared gloss over the whole disc so the seams stay clean.
  const slices = colors.map(([light, dark], i) => `color-mix(in srgb, ${light}, ${dark}) ${i * step}deg ${(i + 1) * step}deg`);
  const gloss = 'radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0) 55%, rgba(0, 0, 0, 0.25))';
  return `${gloss}, conic-gradient(${slices.join(', ')})`;
}

const Pie = ({ letters, size }: { letters: string; size: 'sm' | 'lg' }) => (
  <span class={`sqb-pie sqb-pie-${size}`} style={{ background: pie(letters) }} aria-hidden="true" />
);

/**
 * Select2-style multiselect for a card's colors: chips in the box, a filter
 * you can type into, and a list grouped into single colors, guilds, shards,
 * wedges, four-color sets and rainbow. Picked rows get a green border and name. Single colors, colorless and combinations
 * exclude each other — see toggleColorOption.
 */
export function ColorSelect(props: ColorSelectProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useRef(`sqb-colors-${Math.random().toString(36).slice(2, 8)}`).current;
  const placement = useDropdownPlacement(boxRef, open, LIST_HEIGHT);

  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    return q ? ITEMS.filter((i) => i.haystack.includes(q)) : ITEMS;
  }, [text]);
  const chosen = ITEMS.filter((i) => isSelected(props.value, i));

  useEffect(() => setActive(0), [text]);
  // Keep the active row in view by scrolling the list itself, never the modal around it.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    if (!open || !list || !row) return;
    // The first row of a group brings its heading into view along with it.
    const firstInGroup = row.previousElementSibling?.classList.contains('sqb-ms-group-label');
    const top = firstInGroup ? (row.parentElement as HTMLElement).offsetTop : row.offsetTop;
    if (active === 0) list.scrollTop = 0;
    else if (top < list.scrollTop) list.scrollTop = top;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }, [active, open]);

  const toggle = (item: Item) => {
    props.onChange(toggleColorOption(props.value, item.option));
    setText('');
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (shown.length > 0) setActive((i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
      return;
    }
    if (event.key === 'Enter') {
      // Never let Enter reach Scryfall's own search form while picking colors.
      event.preventDefault();
      const picked = shown[active];
      if (open && picked) toggle(picked);
      else setOpen(true);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Backspace' && text === '' && chosen.length > 0) {
      props.onChange(toggleColorOption(props.value, (chosen[chosen.length - 1] as Item).option));
    }
  };

  // Rows of the same group go into one <li> each, so the groups read as blocks.
  const groups: { label: string; rows: { item: Item; idx: number }[] }[] = [];
  shown.forEach((item, idx) => {
    const last = groups[groups.length - 1];
    if (last?.label === item.group) last.rows.push({ item, idx });
    else groups.push({ label: item.group, rows: [{ item, idx }] });
  });

  return (
    <div class="sqb-field">
      <span class="sqb-label">Colors</span>
      <div class="sqb-ms">
        <div
          ref={boxRef}
          class="sqb-ms-box"
          onMouseDown={(e) => {
            if (e.target !== inputRef.current) {
              e.preventDefault();
              inputRef.current?.focus();
            }
            setOpen(true);
          }}
        >
          {chosen.map((item) => (
            <span key={item.label} class="sqb-chip">
              <Pie letters={item.letters} size="sm" />
              {item.label}
              <button
                type="button"
                class="sqb-chip-remove"
                aria-label={`Remove ${item.label}`}
                // Keeps the focus where it was and doesn't reopen the list.
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
            class="sqb-ms-input"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autocomplete="off"
            placeholder={chosen.length === 0 ? 'Any color' : ''}
            value={text}
            onInput={(e) => {
              setText((e.target as HTMLInputElement).value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          <span class="sqb-ms-caret" aria-hidden="true">
            ▾
          </span>
        </div>

        {open && (
          // mousedown default would blur the input and close the list before the click lands.
          <ul
            ref={listRef}
            class={`sqb-ac-list sqb-ms-list ${placement.up ? 'sqb-drop-up' : ''}`}
            style={{ maxHeight: `${placement.maxHeight}px` }}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            onMouseDown={(e) => e.preventDefault()}
          >
            {groups.map((group) => (
              <li key={group.label} class="sqb-ms-group" role="group" aria-label={group.label}>
                <div class="sqb-ms-group-label">{group.label}</div>
                {group.rows.map(({ item, idx }) => (
                  <button
                    key={item.label}
                    type="button"
                    role="option"
                    aria-selected={isSelected(props.value, item)}
                    data-idx={idx}
                    class={`sqb-ac-item ${idx === active ? 'sqb-ac-active' : ''} ${isSelected(props.value, item) ? 'sqb-ms-selected' : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => toggle(item)}
                  >
                    <Pie letters={item.letters} size="lg" />
                    <span class="sqb-ac-name">{item.label}</span>
                    <span class="sqb-ac-code">{item.letters}</span>
                  </button>
                ))}
              </li>
            ))}
            {shown.length === 0 && <li class="sqb-ac-note">No color matches “{text.trim()}”.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
