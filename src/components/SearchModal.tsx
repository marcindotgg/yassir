import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EMPTY_QUERY, explainQuery, type QueryState } from '../lib/scryfall-syntax';
import { setNameIndex } from '../lib/sets';
import { QueryBuilder, type ApplyMode } from './QueryBuilder';
import { useSets } from './useSets';

export interface SearchModalProps {
  /** Scryfall's own search box: focusing it opens the modal. */
  input: HTMLInputElement;
  /** Things Scryfall draws on top of its box (the logo); copied onto the mirror in place. */
  adornments?: () => Element[];
  /** Submits Scryfall's search form with whatever the box holds. */
  submit: () => void;
}

/** Sheet padding around the mirrored input, px, border included. */
const PAD = 12;
/** Matches .sqb-sheet's border; the input's offset is measured from the border box. */
const BORDER = 1;
/** Gap kept between the sheet and the viewport edges, px. */
const EDGE = 16;
const SHEET_WIDTH = 760;
/** Below this much room under the input, the sheet moves up to the top of the viewport. */
const MIN_ROOM = 360;

/**
 * Everything that makes the copy look like Scryfall's box. Read with transitions
 * off, so a focus ring still animating in is read at its final value.
 */
const MIRRORED = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textAlign', 'textIndent', 'textTransform',
  'color', 'caretColor', 'backgroundColor', 'backgroundImage', 'backgroundPosition', 'backgroundSize', 'backgroundRepeat',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'boxShadow', 'outlineWidth', 'outlineStyle', 'outlineColor', 'outlineOffset',
] as const;

type MirrorStyle = Partial<Record<(typeof MIRRORED)[number] | 'width' | 'height' | 'marginLeft', string>>;

function mirrorStyle(input: HTMLInputElement): MirrorStyle {
  // CSSOM writes are fine under Scryfall's CSP; only style *attributes* are dropped.
  const transition = input.style.transition;
  input.style.transition = 'none';
  const cs = getComputedStyle(input);
  const style: MirrorStyle = {};
  for (const key of MIRRORED) style[key] = cs[key];
  input.style.transition = transition;
  return style;
}

interface Layout {
  /** Where the sheet sits while the input is still in its own place… */
  top: number;
  /** …and where it ends up: the same, unless there is no room below. */
  finalTop: number;
  left: number;
  width: number;
  inputLeft: number;
  inputWidth: number;
  inputHeight: number;
}

/** Lays the sheet out so its input lands exactly on top of Scryfall's. */
function measure(input: HTMLInputElement): Layout {
  const r = input.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const width = Math.max(Math.min(Math.max(SHEET_WIDTH, r.width + 2 * PAD), vw - 2 * EDGE), Math.min(r.width, vw));
  const left = Math.max(0, Math.min(r.left + r.width / 2 - width / 2, vw - EDGE - width));
  const top = r.top - PAD;
  return {
    top,
    finalTop: vh - top - EDGE < MIN_ROOM ? EDGE : top,
    left,
    width,
    inputLeft: r.left - left,
    inputWidth: r.width,
    inputHeight: r.height,
  };
}

interface Adornment {
  html: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Snapshots decorations over the box, positioned relative to the sheet's padding box. */
function copyAdornments(elements: Element[], layout: Layout): Adornment[] {
  return elements.map((el) => {
    const r = el.getBoundingClientRect();
    return { html: el.outerHTML, left: r.left - layout.left - BORDER, top: r.top - layout.top - BORDER, width: r.width, height: r.height };
  });
}

interface Session {
  layout: Layout;
  adornments: Adornment[];
  style: MirrorStyle;
  placeholder: string;
  selection: [number, number];
}

/**
 * Scryfall binds single-letter shortcuts on the document (one of them jumps to
 * /advanced). From out here a keystroke's target is our host, not an input, so
 * it would look like a shortcut: keep every key typed in the sheet to ourselves.
 */
const stopKey = (e: KeyboardEvent) => e.stopPropagation();

/** Locks page scroll so the box under the sheet stays where the sheet thinks it is. */
function lockScroll(): () => void {
  const html = document.documentElement;
  const gutter = window.innerWidth - html.clientWidth;
  const prev = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
  html.style.overflow = 'hidden';
  if (gutter > 0) html.style.paddingRight = `${gutter}px`;
  return () => {
    html.style.overflow = prev.overflow;
    html.style.paddingRight = prev.paddingRight;
  };
}

/**
 * Focusing Scryfall's search box opens this sheet with a copy of the box on top,
 * pixel for pixel where the original sits, holding the same text and caret — so
 * it reads as the same input growing a panel, not a dialog. Below it, the query
 * is explained as you type, and the query builder can write into it.
 */
export function SearchModal({ input, adornments, submit }: SearchModalProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [top, setTop] = useState(0);
  const [value, setValue] = useState('');
  const [builder, setBuilder] = useState<QueryState>(EMPTY_QUERY);
  const sets = useSets();
  const mirrorRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);
  const refocusing = useRef(false);

  const setNames = useMemo(() => setNameIndex(sets.sets), [sets.sets]);
  const explanation = useMemo(() => (value.trim() ? explainQuery(value, setNames) : []), [value, setNames]);

  /** Writes into Scryfall's box. No input event while open: nothing should react behind the sheet. */
  const sync = (next: string) => {
    setValue(next);
    input.value = next;
  };

  const close = (refocus: boolean) => {
    if (!openRef.current) return;
    const mirror = mirrorRef.current;
    const selection = [mirror?.selectionStart ?? value.length, mirror?.selectionEnd ?? value.length] as const;
    openRef.current = false;
    setSession(null);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (!refocus) return;
    refocusing.current = true;
    input.focus();
    input.setSelectionRange(selection[0], selection[1]);
    refocusing.current = false;
  };

  useEffect(() => {
    const open = () => {
      if (openRef.current) {
        mirrorRef.current?.focus();
        return;
      }
      if (refocusing.current) return;
      const len = input.value.length;
      const layout = measure(input);
      const next: Session = {
        layout,
        adornments: copyAdornments(adornments?.() ?? [], layout),
        style: mirrorStyle(input),
        placeholder: input.placeholder,
        selection: [input.selectionStart ?? len, input.selectionEnd ?? len],
      };
      openRef.current = true;
      input.blur();
      setValue(input.value);
      setTop(layout.top);
      setSession(next);
    };
    // A click on the box it already has focus (e.g. after Escape) opens it too.
    const onClick = () => {
      if (!openRef.current && document.activeElement === input) open();
    };
    // Autofill and the like can still write to the box while it is covered.
    const onInput = () => {
      if (openRef.current && input.value !== mirrorRef.current?.value) setValue(input.value);
    };
    // Coming back through the bfcache after a search: don't restore an open sheet.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && openRef.current) {
        openRef.current = false;
        setSession(null);
      }
    };
    input.addEventListener('focus', open);
    input.addEventListener('click', onClick);
    input.addEventListener('input', onInput);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      input.removeEventListener('focus', open);
      input.removeEventListener('click', onClick);
      input.removeEventListener('input', onInput);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [input, adornments]);

  // Hand focus and caret over to the copy in the same frame the sheet appears.
  useLayoutEffect(() => {
    if (!session) return;
    const mirror = mirrorRef.current;
    mirror?.focus();
    mirror?.setSelectionRange(session.selection[0], session.selection[1]);
    const unlock = lockScroll();
    let frame = 0;
    if (session.layout.finalTop !== session.layout.top) frame = requestAnimationFrame(() => setTop(session.layout.finalTop));
    const onResize = () => {
      const layout = measure(input);
      setSession((s) => (s ? { ...s, layout } : s));
      setTop(layout.finalTop);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      unlock();
    };
  }, [session !== null]);

  if (!session) return null;
  const { layout } = session;

  const apply = (query: string, mode: ApplyMode) => {
    const next = mode === 'append' && value.trim() ? `${value.trimEnd()} ${query}` : query;
    sync(next);
    if (mode === 'search') {
      submit();
      return;
    }
    const mirror = mirrorRef.current;
    mirror?.focus();
    mirror?.setSelectionRange(next.length, next.length);
  };

  const onMirrorKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onSheetKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      close(true);
    }
    stopKey(e);
  };

  return (
    <div class="sqb-modal">
      <div class="sqb-backdrop" onClick={() => close(false)} />
      <div
        class="sqb-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        style={{ top: `${top}px`, left: `${layout.left}px`, width: `${layout.width}px`, maxHeight: `calc(100vh - ${top + EDGE}px)` }}
        onKeyDown={onSheetKeyDown}
        onKeyPress={stopKey}
        onKeyUp={stopKey}
      >
        <div class="sqb-sheet-head">
          <input
            ref={mirrorRef}
            class="sqb-mirror"
            type="text"
            name="q"
            aria-label="Search for cards"
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            maxLength={input.maxLength > 0 ? input.maxLength : 1024}
            placeholder={session.placeholder}
            value={value}
            onInput={(e) => sync((e.target as HTMLInputElement).value)}
            onKeyDown={onMirrorKeyDown}
            style={{ ...session.style, marginLeft: `${layout.inputLeft - BORDER}px`, width: `${layout.inputWidth}px`, height: `${layout.inputHeight}px` }}
          />
          {session.adornments.map((a, i) => (
            <span
              key={i}
              class="sqb-adornment"
              aria-hidden="true"
              style={{ left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` }}
              // Scryfall's own markup (an inline SVG), copied so the logo stays put over the box.
              dangerouslySetInnerHTML={{ __html: a.html }}
            />
          ))}
        </div>

        <div class="sqb-sheet-body">
          <section class="sqb-stack">
            <div class="sqb-title">What this query means</div>
            {explanation.length === 0 ? (
              <div class="sqb-muted">Start typing — each part of the query is explained here as you go.</div>
            ) : (
              <ul class="sqb-explain">
                {explanation.map((e, i) => (
                  <li key={i}>
                    <code>{e.token}</code> — {e.text}
                    {!e.known && <span class="sqb-chip sqb-chip-inline">unknown</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section class="sqb-stack">
            <div class="sqb-title">Query builder</div>
            <QueryBuilder state={builder} onChange={setBuilder} sets={sets} onApply={apply} />
          </section>
        </div>
      </div>
    </div>
  );
}
