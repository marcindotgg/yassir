import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { describeNode } from '../lib/query-dictionary';
import type { Expr } from '../lib/query-parse';
import type { Condition } from '../lib/query-sync';
import type { SetSummary } from '../lib/sets';
import { afterAnimation } from '../ui/motion';

interface ConditionPinsProps {
  conditions: readonly Condition[];
  typing: boolean;
  sets: readonly SetSummary[];
  onRemove: (condition: Condition) => void;
}

type Phase = 'initial' | 'enter' | 'exit';

const SETTLE_MS = 1000;
const EXIT_MS = 180;

export function ConditionPins({ conditions, typing, sets, onRemove }: ConditionPinsProps) {
  const setNames = useMemo(() => new Map(sets.map((set) => [set.code, set.name])), [sets]);
  const settled = useSettledConditions(
    conditions.filter((condition) => !isHalfTyped(condition.node)),
    typing,
  );
  const shown = useLastNonEmpty(settled);
  const phase = usePresence(settled.length > 0);
  if (!phase) return null;

  return (
    <div class={phase === 'initial' ? 'sqb-reveal' : `sqb-reveal sqb-reveal-${phase}`}>
      <div class="sqb-field">
        <span class="sqb-label">Other conditions</span>
        <div class="sqb-pins">
          {shown.map((condition, i) => {
            const { text, known } = describeNode(condition.node, (code) => setNames.get(code));
            return (
              <span
                // Keyed by position, so a condition edited in place updates its pin instead of popping in a new one.
                key={i}
                class={`sqb-chip sqb-pin ${known ? '' : 'sqb-pin-unknown'}`}
                title={known ? condition.text : `${condition.text} — Scryfall doesn't know this keyword and will ignore it`}
              >
                <span class="sqb-pin-text">{text}</span>
                <button type="button" class="sqb-chip-remove" aria-label={`Remove ${text}`} onClick={() => onRemove(condition)}>
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function isHalfTyped(node: Expr): boolean {
  return node.kind === 'term' && !node.value && !node.quoted;
}

/** While the query is typed into, pins catch up only once typing pauses, so they don't flicker through `is:f`, `is:fo`… */
function useSettledConditions(conditions: Condition[], typing: boolean): Condition[] {
  const signature = conditions.map((condition) => condition.text).join('\n');
  const settled = useRef({ signature, conditions });
  const latest = useRef(conditions);
  latest.current = conditions;
  const [, rerender] = useState(0);

  if (!typing || settled.current.signature === signature) settled.current = { signature, conditions };
  useEffect(() => {
    if (settled.current.signature === signature) return;
    const timer = window.setTimeout(() => {
      settled.current = { signature, conditions: latest.current };
      rerender((n) => n + 1);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [signature]);

  return settled.current.conditions;
}

function useLastNonEmpty<T>(list: T[]): T[] {
  const last = useRef(list);
  if (list.length > 0) last.current = list;
  return last.current;
}

function usePresence(present: boolean): Phase | null {
  const phase = useRef<Phase | null>(present ? 'initial' : null);
  const [, rerender] = useState(0);
  if (present && (phase.current === null || phase.current === 'exit')) phase.current = 'enter';
  if (!present && (phase.current === 'initial' || phase.current === 'enter')) phase.current = 'exit';
  const current = phase.current;

  useEffect(() => {
    if (current !== 'exit') return;
    const timer = afterAnimation(EXIT_MS, () => {
      phase.current = null;
      rerender((n) => n + 1);
    });
    return () => window.clearTimeout(timer);
  }, [current]);

  return current;
}
