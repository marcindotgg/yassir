import { useMemo, useState } from 'preact/hooks';
import { buildQuery, COLORS, EMPTY_QUERY, explainQuery, FLAGS, FORMATS, ORDERS, RARITIES, type QueryState } from '../lib/scryfall-syntax';
import { setNameIndex } from '../lib/sets';
import { SetAutocomplete } from './SetAutocomplete';
import { useSets } from './useSets';

export interface QueryBuilderProps {
  /** Reads the current text of Scryfall's search box (for "explain"). */
  getSearchValue: () => string;
  /** Writes into Scryfall's search box; `submit` also runs the search. */
  setSearchValue: (query: string, submit: boolean) => void;
}

const PRESETS: { label: string; state: Partial<QueryState> }[] = [
  { label: 'Standard-legal under €1', state: { format: 'standard', priceMax: '1', priceCurrency: 'eur', order: 'eur', direction: 'asc' } },
  { label: 'Cheap Commander staples', state: { format: 'commander', priceMax: '2', priceCurrency: 'eur', order: 'edhrec' } },
  { label: 'Mythic rares this year', state: { rarity: ['mythic'], year: `>=${new Date().getFullYear()}`, order: 'released', direction: 'desc' } },
  { label: 'Mono-red instants', state: { colors: ['R'], colorMode: 'exact', type: 'instant' } },
];

const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** Form-driven Scryfall query builder for the homepage, with a live preview and an explainer. */
export function QueryBuilder(props: QueryBuilderProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<QueryState>(EMPTY_QUERY);
  const [explain, setExplain] = useState<ReturnType<typeof explainQuery> | null>(null);
  const sets = useSets();

  const query = useMemo(() => buildQuery(state), [state]);
  const setNames = useMemo(() => setNameIndex(sets.sets), [sets.sets]);
  const set = <K extends keyof QueryState>(key: K, value: QueryState[K]) => setState((s) => ({ ...s, [key]: value }));

  const explainCurrent = () => {
    const current = props.getSearchValue().trim() || query;
    setExplain(current ? explainQuery(current, setNames) : []);
  };

  return (
    <div class="sqb-qb">
      <div class="sqb-row">
        <button type="button" class="sqb-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide query builder' : 'New to the syntax? Open the query builder'}
        </button>
        <button type="button" class="sqb-btn sqb-btn-ghost" onClick={explainCurrent}>
          Explain my query
        </button>
      </div>

      {explain && (
        <div class="sqb-panel sqb-stack">
          <div class="sqb-row-between">
            <div class="sqb-title sqb-title-flush">
              What this query means
            </div>
            <button type="button" class="sqb-btn sqb-btn-sm sqb-btn-ghost" onClick={() => setExplain(null)}>
              ✕
            </button>
          </div>
          {explain.length === 0 ? (
            <div class="sqb-muted">Type a query first.</div>
          ) : (
            <ul class="sqb-explain">
              {explain.map((e, i) => (
                <li key={i}>
                  <code>{e.token}</code> — {e.text}
                  {!e.known && <span class="sqb-chip sqb-chip-inline">unknown</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && (
        <div class="sqb-panel sqb-stack">
          <div class="sqb-wrap">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" class="sqb-btn sqb-btn-sm" onClick={() => setState({ ...EMPTY_QUERY, ...p.state })}>
                {p.label}
              </button>
            ))}
            <button type="button" class="sqb-btn sqb-btn-sm sqb-btn-ghost" onClick={() => setState(EMPTY_QUERY)}>
              Reset
            </button>
          </div>

          <div class="sqb-qb-grid">
            <label class="sqb-field">
              <span class="sqb-label">Name</span>
              <input class="sqb-input" value={state.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} placeholder="Lightning Bolt" />
            </label>
            <label class="sqb-field">
              <span class="sqb-label">Rules text (o:)</span>
              <input class="sqb-input" value={state.text} onInput={(e) => set('text', (e.target as HTMLInputElement).value)} placeholder='draw "a card"' />
            </label>
            <label class="sqb-field">
              <span class="sqb-label">Type (t:)</span>
              <input class="sqb-input" value={state.type} onInput={(e) => set('type', (e.target as HTMLInputElement).value)} placeholder="legendary creature" />
            </label>
            <div class="sqb-field">
              <span class="sqb-label">Colors</span>
              <div class="sqb-color-row">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    class={`sqb-color-btn ${state.colors.includes(c) ? 'sqb-on' : ''}`}
                    style={{ background: { W: '#f8f6d8', U: '#c1d7e9', B: '#bab1ab', R: '#e49977', G: '#a3c095' }[c] }}
                    onClick={() => set('colors', toggle(state.colors, c))}
                    disabled={state.colorless}
                  >
                    {c}
                  </button>
                ))}
                <label class="sqb-row sqb-small">
                  <input type="checkbox" checked={state.colorless} onChange={(e) => set('colorless', (e.target as HTMLInputElement).checked)} /> colorless
                </label>
              </div>
              <select class="sqb-select" value={state.colorMode} onChange={(e) => set('colorMode', (e.target as HTMLSelectElement).value as QueryState['colorMode'])}>
                <option value="atMost">at most these colors (c&lt;=)</option>
                <option value="exact">exactly these colors (c=)</option>
                <option value="atLeast">at least these colors (c&gt;=)</option>
                <option value="identity">fits this commander identity (id&lt;=)</option>
              </select>
            </div>
            <div class="sqb-field">
              <span class="sqb-label">Mana value</span>
              <div class="sqb-row">
                <select class="sqb-select" value={state.manaValueOp} onChange={(e) => set('manaValueOp', (e.target as HTMLSelectElement).value as QueryState['manaValueOp'])}>
                  {['=', '<=', '>=', '<', '>'].map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                <input class="sqb-input sqb-input-sm" value={state.manaValue} onInput={(e) => set('manaValue', (e.target as HTMLInputElement).value)} placeholder="3" />
              </div>
            </div>
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
            <div class="sqb-field">
              <span class="sqb-label">Max price</span>
              <div class="sqb-row">
                <select class="sqb-select" value={state.priceCurrency} onChange={(e) => set('priceCurrency', (e.target as HTMLSelectElement).value as 'eur' | 'usd')}>
                  <option value="eur">EUR</option>
                  <option value="usd">USD</option>
                </select>
                <input class="sqb-input sqb-input-sm" value={state.priceMax} onInput={(e) => set('priceMax', (e.target as HTMLInputElement).value)} placeholder="1.50" />
              </div>
            </div>
            <label class="sqb-field">
              <span class="sqb-label">Power (pow)</span>
              <input class="sqb-input" value={state.power} onInput={(e) => set('power', (e.target as HTMLInputElement).value)} placeholder=">=4" />
            </label>
            <label class="sqb-field">
              <span class="sqb-label">Toughness (tou)</span>
              <input class="sqb-input" value={state.toughness} onInput={(e) => set('toughness', (e.target as HTMLInputElement).value)} placeholder="<=2" />
            </label>
            <label class="sqb-field">
              <span class="sqb-label">Artist (a:)</span>
              <input class="sqb-input" value={state.artist} onInput={(e) => set('artist', (e.target as HTMLInputElement).value)} placeholder="Seb McKinnon" />
            </label>
            <label class="sqb-field">
              <span class="sqb-label">Year</span>
              <input class="sqb-input" value={state.year} onInput={(e) => set('year', (e.target as HTMLInputElement).value)} placeholder=">=2020" />
            </label>
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
            <span class="sqb-label">Query</span>
            <div class="sqb-qb-preview">{query || <span class="sqb-muted">Fill in a field to see the query…</span>}</div>
          </div>
          <div class="sqb-row">
            <button type="button" class="sqb-btn" disabled={!query} onClick={() => props.setSearchValue(query, false)}>
              Insert into search box
            </button>
            <button type="button" class="sqb-btn sqb-btn-primary" disabled={!query} onClick={() => props.setSearchValue(query, true)}>
              Search
            </button>
            <button type="button" class="sqb-btn sqb-btn-ghost" disabled={!query} onClick={() => setExplain(explainQuery(query, setNames))}>
              Explain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
