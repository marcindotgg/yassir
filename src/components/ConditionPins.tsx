import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { describe } from '../lib/query-dictionary';
import type { Expr } from '../lib/query-parse';
import type { Condition } from '../lib/query-sync';
import type { SetSummary } from '../lib/sets';

export interface ConditionPinsProps {
  /** Conditions in the query that no field can show. */
  extras: readonly Condition[];
  /** The query last changed by being typed into, rather than through the form or a pin. */
  typing: boolean;
  sets: readonly SetSummary[];
  onRemove: (condition: Condition) => void;
}

/** How long typing in the box has to pause before the pins catch up with it. */
const SETTLE_MS = 1000;
/** Matches .sqb-reveal-exit in styles.css. */
const EXIT_MS = 180;

/** `t:`, `mv>=`, a lone `-`: a term still being typed, not a condition yet. */
const half = (node: Expr) => node.kind === 'term' && !node.value && !node.quoted;

type Phase = 'initial' | 'enter' | 'exit';

/**
 * Keeps something mounted through its exit animation. 'initial' when it was
 * there from the first render (it arrives with the sheet), 'enter' when it
 * showed up later, 'exit' while it animates out, null once it's gone.
 */
function usePresence(present: boolean): Phase | null {
  const phase = useRef<Phase | null>(present ? 'initial' : null);
  const [, rerender] = useState(0);
  if (present && (phase.current === null || phase.current === 'exit')) phase.current = 'enter';
  if (!present && (phase.current === 'initial' || phase.current === 'enter')) phase.current = 'exit';
  const current = phase.current;
  useEffect(() => {
    if (current !== 'exit') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      phase.current = null;
      rerender((n) => n + 1);
    }, reduced ? 0 : EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [current]);
  return current;
}

/**
 * Pins for whatever the query asks that the form has no field for, each named
 * and with a button that takes it out of the query. The section is there only
 * while there is something to pin: it comes with the sheet when the query
 * already has such a condition, and opens up below the form when one is typed.
 */
export function ConditionPins({ extras, typing, sets, onRemove }: ConditionPinsProps) {
  const setNames = useMemo(() => new Map(sets.map((s) => [s.code, s.name])), [sets]);
  const current = extras.filter((c) => !half(c.node));
  const signature = current.map((c) => c.text).join('\n');

  // While the query is being typed, the pins wait for a pause and then catch up
  // all at once, so they don't flicker through `is:f`, `is:fo`… on the way to
  // `is:foil`, and retyping the only condition doesn't fold the section away and
  // open it again. A pin or form edit shows at once.
  const settled = useRef({ signature, conditions: current });
  const latest = useRef(current);
  latest.current = current;
  const [, rerender] = useState(0);
  // Same conditions (maybe moved by typing before them): take their fresh positions.
  if (!typing || settled.current.signature === signature) settled.current = { signature, conditions: current };
  useEffect(() => {
    if (settled.current.signature === signature) return;
    const timer = window.setTimeout(() => {
      settled.current = { signature, conditions: latest.current };
      rerender((n) => n + 1);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [signature]);
  const shown = settled.current.conditions;

  // While the section folds away it keeps showing what it last held.
  const last = useRef(shown);
  if (shown.length > 0) last.current = shown;
  const phase = usePresence(shown.length > 0);
  if (!phase) return null;
  const pins = last.current.map((condition) => ({ condition, ...describe(condition.node, { set: (code) => setNames.get(code) }) }));

  return (
    <div class={phase === 'initial' ? 'sqb-reveal' : `sqb-reveal sqb-reveal-${phase}`}>
      <div class="sqb-field">
        <span class="sqb-label">Other conditions</span>
        <div class="sqb-pins">
          {pins.map((pin, i) => (
            <span
              // By place, not by what it says: a condition edited in place updates its pin rather than popping a new one in.
              key={i}
              class={`sqb-chip sqb-pin ${pin.known ? '' : 'sqb-pin-unknown'}`}
              title={pin.known ? pin.condition.text : `${pin.condition.text} — Scryfall doesn't know this keyword and will ignore it`}
            >
              <span class="sqb-pin-text">{pin.text}</span>
              <button type="button" class="sqb-chip-remove" aria-label={`Remove ${pin.text}`} onClick={() => onRemove(pin.condition)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
