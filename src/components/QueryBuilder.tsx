import { useMemo, useRef, useState } from 'preact/hooks';
import { describe } from '../lib/query-dictionary';
import type { Condition } from '../lib/query-sync';
import { EMPTY_QUERY, FIELD_TERMS, FLAGS, FORMATS, ORDERS, RARITIES, type FieldId, type QueryState } from '../lib/scryfall-syntax';
import { ColorSelect } from './ColorSelect';
import { SetAutocomplete } from './SetAutocomplete';
import type { useSets } from './useSets';

type Update = (update: (state: QueryState) => QueryState) => void;

export interface QueryBuilderProps {
  /** The query in the box: the form shows it and writes into it. */
  query: string;
  /** What the query says, field by field. */
  state: QueryState;
  /** Rewrites the fields `update` changes in the query; the rest of it stays as typed. */
  onChange: Update;
  /** Conditions in the query that no field can show. */
  extras: readonly Condition[];
  onRemove: (condition: Condition) => void;
  onClear: () => void;
  onSearch: () => void;
  sets: ReturnType<typeof useSets>;
}

/** Laid over the query: they set their own fields and leave the rest of it be. */
const PRESETS: { label: string; state: Partial<QueryState> }[] = [
  { label: 'Standard-legal under €1', state: { format: 'standard', priceMax: '1', priceCurrency: 'eur', order: 'eur', direction: 'asc' } },
  { label: 'Cheap Commander staples', state: { format: 'commander', priceMax: '2', priceCurrency: 'eur', order: 'edhrec' } },
  { label: 'Mythic rares this year', state: { rarity: ['mythic'], year: `>=${new Date().getFullYear()}`, order: 'released', direction: 'desc' } },
  { label: 'Red instants', state: { colors: ['R'], colorless: false, colorCombos: [], type: 'instant' } },
];

const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** What `field` writes into the query when set to `patch`. */
const writes = (field: FieldId, patch: Partial<QueryState>): string => FIELD_TERMS[field]({ ...EMPTY_QUERY, ...patch }).join(' ');

/**
 * A field's own copy of what is typed into it. The query keeps only what it can
 * use — `draw ` comes back as `draw`, a lone `>=` as nothing — so showing the
 * query's reading as-is would eat spaces and operators under the caret. The copy
 * gives way as soon as the query says something it wouldn't write.
 */
function useDraft<T>(value: T, write: (value: T) => string): [T, (next: T) => void] {
  const draft = useRef(value);
  const [, rerender] = useState(0);
  if (write(draft.current) !== write(value)) draft.current = value;
  const set = (next: T) => {
    draft.current = next;
    rerender((n) => n + 1);
  };
  return [draft.current, set];
}

type TextFieldId = 'name' | 'text' | 'type' | 'power' | 'toughness' | 'artist' | 'year';

function TextField(props: { field: TextFieldId; label: string; placeholder: string; state: QueryState; onChange: Update }) {
  const { field } = props;
  const [text, setText] = useDraft(props.state[field], (v) => writes(field, { [field]: v }));
  return (
    <label class="sqb-field">
      <span class="sqb-label">{props.label}</span>
      <input
        class="sqb-input"
        value={text}
        placeholder={props.placeholder}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setText(v);
          props.onChange((s) => ({ ...s, [field]: v }));
        }}
      />
    </label>
  );
}

const MV_OPS: QueryState['manaValueOp'][] = ['=', '<=', '>=', '<', '>'];

function ManaValueField({ state, onChange }: { state: QueryState; onChange: Update }) {
  const [mv, setMv] = useDraft({ manaValueOp: state.manaValueOp, manaValue: state.manaValue }, (v) => writes('manaValue', v));
  const edit = (patch: Partial<typeof mv>) => {
    const next = { ...mv, ...patch };
    setMv(next);
    onChange((s) => ({ ...s, ...next }));
  };
  return (
    <div class="sqb-field">
      <span class="sqb-label">Mana value</span>
      <div class="sqb-row">
        <select class="sqb-select" value={mv.manaValueOp} onChange={(e) => edit({ manaValueOp: (e.target as HTMLSelectElement).value as QueryState['manaValueOp'] })}>
          {MV_OPS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        <input class="sqb-input sqb-input-sm" value={mv.manaValue} onInput={(e) => edit({ manaValue: (e.target as HTMLInputElement).value })} placeholder="3" />
      </div>
    </div>
  );
}

function PriceField({ state, onChange }: { state: QueryState; onChange: Update }) {
  const [price, setPrice] = useDraft({ priceCurrency: state.priceCurrency, priceMax: state.priceMax }, (v) => writes('price', v));
  const edit = (patch: Partial<typeof price>) => {
    const next = { ...price, ...patch };
    setPrice(next);
    onChange((s) => ({ ...s, ...next }));
  };
  return (
    <div class="sqb-field">
      <span class="sqb-label">Max price</span>
      <div class="sqb-row">
        <select class="sqb-select" value={price.priceCurrency} onChange={(e) => edit({ priceCurrency: (e.target as HTMLSelectElement).value as QueryState['priceCurrency'] })}>
          <option value="eur">EUR</option>
          <option value="usd">USD</option>
        </select>
        <input class="sqb-input sqb-input-sm" value={price.priceMax} onInput={(e) => edit({ priceMax: (e.target as HTMLInputElement).value })} placeholder="1.50" />
      </div>
    </div>
  );
}

/**
 * The form over Scryfall's query syntax. It holds no state of its own: every
 * field shows what the query in the box says and writes straight back into it,
 * and whatever the query asks that no field can show is pinned below the form,
 * named, with a button to take it out.
 */
export function QueryBuilder(props: QueryBuilderProps) {
  const { state, sets } = props;
  const set = <K extends keyof QueryState>(key: K, value: QueryState[K]) => props.onChange((s) => ({ ...s, [key]: value }));
  const setNames = useMemo(() => new Map(sets.sets.map((s) => [s.code, s.name])), [sets.sets]);
  const pins = props.extras.map((c) => ({ condition: c, ...describe(c.node, { set: (code) => setNames.get(code) }) }));
  const field = { state, onChange: props.onChange };

  return (
    <div class="sqb-stack sqb-qb">
      <div class="sqb-wrap">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" class="sqb-btn sqb-btn-sm" onClick={() => props.onChange((s) => ({ ...s, ...p.state }))}>
            {p.label}
          </button>
        ))}
        <button type="button" class="sqb-btn sqb-btn-sm sqb-btn-ghost" disabled={!props.query.trim()} onClick={props.onClear}>
          Clear
        </button>
      </div>

      <div class="sqb-qb-grid">
        <TextField {...field} field="name" label="Name" placeholder="Lightning Bolt" />
        <TextField {...field} field="text" label="Rules text (o:)" placeholder='draw "a card"' />
        <TextField {...field} field="type" label="Type (t:)" placeholder="legendary creature" />
        <ColorSelect
          value={{ colors: state.colors, colorless: state.colorless, colorCombos: state.colorCombos }}
          onChange={(next) => props.onChange((s) => ({ ...s, ...next }))}
        />
        <ManaValueField {...field} />
        <div class="sqb-field">
          <span class="sqb-label">Rarity</span>
          <div class="sqb-wrap">
            {RARITIES.map((r) => (
              <button key={r} type="button" class={`sqb-btn sqb-btn-sm ${state.rarity.includes(r) ? 'sqb-btn-active' : ''}`} onClick={() => set('rarity', toggle(state.rarity, r))}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <SetAutocomplete
          sets={sets.sets}
          status={sets.status}
          {...(sets.error ? { error: sets.error } : {})}
          selected={state.sets}
          onChange={(codes) => set('sets', codes)}
          onRetry={sets.reload}
        />

        <label class="sqb-field">
          <span class="sqb-label">Format (f:)</span>
          <select class="sqb-select" value={state.format} onChange={(e) => set('format', (e.target as HTMLSelectElement).value)}>
            <option value="">any</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <PriceField {...field} />
        <TextField {...field} field="power" label="Power (pow)" placeholder=">=4" />
        <TextField {...field} field="toughness" label="Toughness (tou)" placeholder="<=2" />
        <TextField {...field} field="artist" label="Artist (a:)" placeholder="Seb McKinnon" />
        <TextField {...field} field="year" label="Year" placeholder=">=2020" />
        <div class="sqb-field">
          <span class="sqb-label">Sort</span>
          <div class="sqb-row">
            <select class="sqb-select" value={state.order} onChange={(e) => set('order', (e.target as HTMLSelectElement).value)}>
              <option value="">default</option>
              {ORDERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select class="sqb-select" value={state.direction} onChange={(e) => set('direction', (e.target as HTMLSelectElement).value as QueryState['direction'])}>
              <option value="auto">auto</option>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </div>
        </div>
      </div>

      <div class="sqb-field">
        <span class="sqb-label">Flags (is:)</span>
        <div class="sqb-wrap">
          {FLAGS.map((f) => (
            <button key={f} type="button" class={`sqb-btn sqb-btn-sm ${state.flags.includes(f) ? 'sqb-btn-active' : ''}`} onClick={() => set('flags', toggle(state.flags, f))}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div class="sqb-field">
        <span class="sqb-label">Other conditions</span>
        <div class="sqb-pins">
          {pins.length === 0 && <span class="sqb-muted">Anything in the query the form has no field for shows up here.</span>}
          {pins.map((pin) => (
            <span
              key={`${pin.condition.start}:${pin.condition.text}`}
              class={`sqb-chip sqb-pin ${pin.known ? '' : 'sqb-pin-unknown'}`}
              title={pin.known ? pin.condition.text : `${pin.condition.text} — Scryfall doesn't know this keyword and will ignore it`}
            >
              <span class="sqb-pin-text">{pin.text}</span>
              <button type="button" class="sqb-chip-remove" aria-label={`Remove ${pin.text}`} onClick={() => props.onRemove(pin.condition)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <div class="sqb-row">
        <button type="button" class="sqb-btn sqb-btn-primary" disabled={!props.query.trim()} onClick={props.onSearch}>
          Search
        </button>
      </div>
    </div>
  );
}
