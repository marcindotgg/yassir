import { useRef, useState } from 'preact/hooks';
import { capitalize } from '../lib/query-dictionary';
import type { Condition } from '../lib/query-sync';
import { EMPTY_QUERY, FIELD_TERMS, FLAGS, FORMATS, ORDERS, RARITIES, toggleItem, type FieldId, type QueryState } from '../lib/scryfall-syntax';
import type { SuggestionGroup } from '../lib/suggestions';
import { TAG_DESCRIPTIONS, TAG_GROUPS } from '../lib/tag-suggestions';
import { TYPE_GROUPS } from '../lib/type-suggestions';
import { ColorSelect } from './ColorSelect';
import { ConditionPins } from './ConditionPins';
import { SetAutocomplete } from './SetAutocomplete';
import { SuggestCombobox } from './SuggestCombobox';
import type { SetList } from './useSets';

type FormUpdate = (update: (state: QueryState) => QueryState) => void;

interface FormProps {
  state: QueryState;
  onChange: FormUpdate;
}

interface QueryBuilderProps extends FormProps {
  query: string;
  otherConditions: readonly Condition[];
  typing: boolean;
  searching: boolean;
  setList: SetList;
  onRemove: (condition: Condition) => void;
  onClear: () => void;
  onSearch: () => void;
}

const POPULAR_ARTISTS = [
  'John Avon',
  'Christopher Rush',
  'Rebecca Guay',
  'Kev Walker',
  'Mark Tedin',
  'Ron Spencer',
  'Seb McKinnon',
  'Quinton Hoover',
  'Richard Kane Ferguson',
  'Magali Villeneuve',
];
const ARTIST_PLACEHOLDER = POPULAR_ARTISTS[Math.floor(Math.random() * POPULAR_ARTISTS.length)] ?? 'Seb McKinnon';
const TYPES = TYPE_GROUPS.flatMap((group) => group.items);
const TYPE_PLACEHOLDER = TYPES[Math.floor(Math.random() * TYPES.length)] ?? 'Creature';

const ORDER_LABELS: Partial<Record<(typeof ORDERS)[number], string>> = { usd: 'USD', eur: 'EUR', cmc: 'CMC', edhrec: 'EDHREC' };

type TextFieldId = 'name' | 'rulesText' | 'type' | 'manaValue' | 'power' | 'toughness' | 'artist' | 'otag' | 'year';

interface TextFieldProps extends FormProps {
  field: TextFieldId;
  label: string;
  placeholder: string;
}

export function QueryBuilder({ query, state, onChange, otherConditions, typing, searching, setList, onRemove, onClear, onSearch }: QueryBuilderProps) {
  const setField = fieldSetter(onChange);
  const isEmpty = !query.trim();

  // Enter in any field submits; widgets that use Enter themselves call preventDefault on it.
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!isEmpty && !searching) onSearch();
  };

  return (
    <form class="sqb-stack sqb-builder" onSubmit={submit}>
      <div class="sqb-builder-columns">
        <CardFields state={state} onChange={onChange} setList={setList} />
        <OtherFields state={state} onChange={onChange} />
      </div>

      <div class="sqb-field sqb-flags">
        <span class="sqb-label">Flags (is:)</span>
        <div class="sqb-wrap">
          {FLAGS.map((flag) => (
            <button
              key={flag}
              type="button"
              class={`sqb-btn sqb-btn-sm sqb-flag-btn ${state.flags.includes(flag) ? 'sqb-btn-active' : ''}`}
              onClick={() => setField('flags', toggleItem(state.flags, flag))}
            >
              {flag}
            </button>
          ))}
        </div>
      </div>

      <ConditionPins conditions={otherConditions} typing={typing} sets={setList.sets} onRemove={onRemove} />

      <div class="sqb-row sqb-actions">
        <button type="button" class="sqb-btn sqb-btn-ghost" disabled={isEmpty} onClick={onClear}>
          Clear
        </button>
        <button type="submit" class={`sqb-btn sqb-btn-primary${searching ? ' sqb-btn-busy' : ''}`} disabled={isEmpty} aria-busy={searching}>
          {searching && <span class="sqb-spinner" aria-hidden="true" />}
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
    </form>
  );
}

function CardFields({ state, onChange, setList }: FormProps & { setList: SetList }) {
  const setField = fieldSetter(onChange);
  const form = { state, onChange };

  return (
    <div class="sqb-builder-column">
      <TextField {...form} field="name" label="Name" placeholder="Lightning Bolt" />
      <div class="sqb-pair sqb-pair-mana">
        <ColorSelect
          value={{ colors: state.colors, colorless: state.colorless, colorCombos: state.colorCombos }}
          onChange={(colors) => onChange((s) => ({ ...s, ...colors }))}
        />
        <TextField {...form} field="manaValue" label="Mana value (mv)" placeholder="e.g. 3, <=2, >=4" />
      </div>
      <SuggestField {...form} field="type" suggestions={TYPE_GROUPS} label="Type (t:)" placeholder={`e.g. ${TYPE_PLACEHOLDER}`} />
      <div class="sqb-field">
        <span class="sqb-label">Rarity</span>
        <div class="sqb-wrap">
          {RARITIES.map((rarity) => (
            <button
              key={rarity}
              type="button"
              class={`sqb-btn sqb-btn-sm sqb-rarity-btn ${state.rarity.includes(rarity) ? 'sqb-btn-active' : ''}`}
              onClick={() => setField('rarity', toggleItem(state.rarity, rarity))}
            >
              <span class={`sqb-rarity-dot sqb-rarity-${rarity}`} aria-hidden="true" />
              {capitalize(rarity)}
            </button>
          ))}
        </div>
      </div>
      <SetAutocomplete setList={setList} selected={state.sets} onChange={(codes) => setField('sets', codes)} />
      <TextField {...form} field="rulesText" label="Rules text (o:)" placeholder='Draw "a card"' />
      <div class="sqb-pair">
        <TextField {...form} field="power" label="Power (pow)" placeholder="e.g. 3, >=4, >tou" />
        <TextField {...form} field="toughness" label="Toughness (tou)" placeholder="e.g. 3, <=2, >pow" />
      </div>
    </div>
  );
}

function OtherFields({ state, onChange }: FormProps) {
  const setField = fieldSetter(onChange);
  const form = { state, onChange };

  return (
    <div class="sqb-builder-column sqb-builder-aside">
      <PriceField {...form} />
      <TextField {...form} field="year" label="Year" placeholder="e.g. 2020, >=2020" />
      <label class="sqb-field">
        <span class="sqb-label">Format (f:)</span>
        <select class="sqb-select" value={state.format} onChange={(e) => setField('format', e.currentTarget.value)}>
          <option value="">Any</option>
          {FORMATS.map((format) => (
            <option key={format} value={format}>
              {capitalize(format)}
            </option>
          ))}
        </select>
      </label>
      <SuggestField {...form} field="otag" suggestions={TAG_GROUPS} descriptions={TAG_DESCRIPTIONS} label="Oracle tag (otag:)" placeholder="Removal" />
      <TextField {...form} field="artist" label="Artist (a:)" placeholder={ARTIST_PLACEHOLDER} />
      <div class="sqb-field">
        <span class="sqb-label">Sort</span>
        <div class="sqb-input-group">
          <select class="sqb-select sqb-grow" value={state.order} onChange={(e) => setField('order', e.currentTarget.value)}>
            <option value="">Default</option>
            {ORDERS.map((order) => (
              <option key={order} value={order}>
                {ORDER_LABELS[order] ?? capitalize(order)}
              </option>
            ))}
          </select>
          <select class="sqb-select" value={state.direction} onChange={(e) => setField('direction', e.currentTarget.value as QueryState['direction'])}>
            <option value="auto">Auto</option>
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function TextField({ field, label, placeholder, ...form }: TextFieldProps) {
  const [text, edit] = useTextFieldDraft(field, form);
  return (
    <label class="sqb-field">
      <span class="sqb-label">{label}</span>
      <input class="sqb-input" value={text} placeholder={placeholder} onInput={(e) => edit(e.currentTarget.value)} />
    </label>
  );
}

function SuggestField({ field, label, placeholder, suggestions, descriptions, ...form }: TextFieldProps & { suggestions: readonly SuggestionGroup[]; descriptions?: ReadonlyMap<string, string> }) {
  const [text, edit] = useTextFieldDraft(field, form);
  return (
    <div class="sqb-field">
      <span class="sqb-label">{label}</span>
      <SuggestCombobox value={text} placeholder={placeholder} suggestions={suggestions} descriptions={descriptions} onInput={edit} />
    </div>
  );
}

function PriceField({ state, onChange }: FormProps) {
  const [price, setPrice] = useDraft({ priceCurrency: state.priceCurrency, priceMax: state.priceMax }, (draft) => queryTextFor('price', draft));
  const edit = (patch: Partial<typeof price>) => {
    const next = { ...price, ...patch };
    setPrice(next);
    onChange((s) => ({ ...s, ...next }));
  };
  return (
    <div class="sqb-field">
      <span class="sqb-label">Max price</span>
      <div class="sqb-input-group">
        <select class="sqb-select" value={price.priceCurrency} onChange={(e) => edit({ priceCurrency: e.currentTarget.value as QueryState['priceCurrency'] })}>
          <option value="eur">EUR</option>
          <option value="usd">USD</option>
        </select>
        <input class="sqb-input sqb-grow" value={price.priceMax} onInput={(e) => edit({ priceMax: e.currentTarget.value })} placeholder="1.50" />
      </div>
    </div>
  );
}

function useTextFieldDraft(field: TextFieldId, { state, onChange }: FormProps): [string, (text: string) => void] {
  const [draft, setDraft] = useDraft(state[field], (text) => queryTextFor(field, { [field]: text }));
  const edit = (text: string) => {
    setDraft(text);
    onChange((s) => ({ ...s, [field]: text }));
  };
  return [draft, edit];
}

/**
 * Keeps what the user typed (`draw `, a lone `>=`) until the query says something the draft wouldn't
 * write; showing the query's own reading would eat spaces and operators under the caret.
 */
function useDraft<T>(value: T, toQueryText: (value: T) => string): [T, (next: T) => void] {
  const draft = useRef(value);
  const [, rerender] = useState(0);
  if (toQueryText(draft.current) !== toQueryText(value)) draft.current = value;
  const setDraft = (next: T) => {
    draft.current = next;
    rerender((n) => n + 1);
  };
  return [draft.current, setDraft];
}

function queryTextFor(field: FieldId, patch: Partial<QueryState>): string {
  return FIELD_TERMS[field]({ ...EMPTY_QUERY, ...patch }).join(' ');
}

function fieldSetter(onChange: FormUpdate) {
  return <K extends keyof QueryState>(key: K, value: QueryState[K]) => onChange((s) => ({ ...s, [key]: value }));
}
