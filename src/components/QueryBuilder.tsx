import { useRef, useState } from 'preact/hooks';
import type { Condition } from '../lib/query-sync';
import { EMPTY_QUERY, FIELD_TERMS, FLAGS, FORMATS, ORDERS, RARITIES, type FieldId, type QueryState } from '../lib/scryfall-syntax';
import { ColorSelect } from './ColorSelect';
import { ConditionPins } from './ConditionPins';
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
  /** The query last changed by being typed into the box. */
  typing: boolean;
  onRemove: (condition: Condition) => void;
  onClear: () => void;
  onSearch: () => void;
  /** The query has been sent off and Scryfall's results are loading. */
  searching: boolean;
  sets: ReturnType<typeof useSets>;
}

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

type TextFieldId = 'name' | 'text' | 'type' | 'power' | 'toughness' | 'artist' | 'otag' | 'year';

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
 * and whatever the query asks that no field can show is pinned below the form.
 */
export function QueryBuilder(props: QueryBuilderProps) {
  const { state, sets } = props;
  const set = <K extends keyof QueryState>(key: K, value: QueryState[K]) => props.onChange((s) => ({ ...s, [key]: value }));
  const field = { state, onChange: props.onChange };

  return (
    <div class="sqb-stack sqb-qb">
      <div class="sqb-qb-cols">
        {/* What's printed on the card, top to bottom. */}
        <div class="sqb-qb-col">
          <TextField {...field} field="name" label="Name" placeholder="Lightning Bolt" />
          <div class="sqb-qb-pair sqb-qb-pair-mana">
            <ColorSelect
              value={{ colors: state.colors, colorless: state.colorless, colorCombos: state.colorCombos }}
              onChange={(next) => props.onChange((s) => ({ ...s, ...next }))}
            />
            <ManaValueField {...field} />
          </div>
          <TextField {...field} field="type" label="Type (t:)" placeholder="legendary creature" />
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
          <TextField {...field} field="text" label="Rules text (o:)" placeholder='draw "a card"' />
          <div class="sqb-qb-pair">
            <TextField {...field} field="power" label="Power (pow)" placeholder=">=4" />
            <TextField {...field} field="toughness" label="Toughness (tou)" placeholder="<=2" />
          </div>
        </div>

        {/* Everything the card itself doesn't show. */}
        <div class="sqb-qb-col sqb-qb-col-aside">
          <PriceField {...field} />
          <TextField {...field} field="year" label="Year" placeholder=">=2020" />
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
          <TextField {...field} field="otag" label="Oracle tag (otag:)" placeholder="removal" />
          <TextField {...field} field="artist" label="Artist (a:)" placeholder="Seb McKinnon" />
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
      </div>

      <div class="sqb-field sqb-qb-flags">
        <span class="sqb-label">Flags (is:)</span>
        <div class="sqb-wrap">
          {FLAGS.map((f) => (
            <button key={f} type="button" class={`sqb-btn sqb-btn-sm ${state.flags.includes(f) ? 'sqb-btn-active' : ''}`} onClick={() => set('flags', toggle(state.flags, f))}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <ConditionPins extras={props.extras} typing={props.typing} sets={sets.sets} onRemove={props.onRemove} />

      <div class="sqb-row sqb-qb-actions">
        <button type="button" class="sqb-btn sqb-btn-ghost" disabled={!props.query.trim()} onClick={props.onClear}>
          Clear
        </button>
        <button
          type="button"
          class={`sqb-btn sqb-btn-primary${props.searching ? ' sqb-btn-busy' : ''}`}
          disabled={!props.query.trim()}
          aria-busy={props.searching}
          onClick={props.searching ? undefined : props.onSearch}
        >
          {props.searching && <span class="sqb-spinner" aria-hidden="true" />}
          {props.searching ? 'Searching…' : 'Search'}
        </button>
      </div>
    </div>
  );
}
