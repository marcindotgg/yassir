import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { readQuery, removeCondition, writeQuery, type Condition } from '../lib/query-sync';
import type { QueryState } from '../lib/scryfall-syntax';
import { backgroundBehind } from '../ui/theme';
import { QueryBuilder } from './QueryBuilder';
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
const SHEET_WIDTH = 1000;
/** Where the input glides to on open, as a share of the viewport height. */
const LIFT_TO = 0.12;
/** .sqb-sheet-head's bottom padding + border, below the input. */
const HEAD_BELOW = 13;
/** Matches the close animations in styles.css. */
const CLOSE_MS = 180;
/** A box scrolled out of view: the sheet drops in from just this far off its resting place instead. */
const OFFSCREEN_TRAVEL = 48;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  // The header box is see-through, painted by the bar behind it. The copy sits in
  // the sheet, so it takes that colour along or it would change on the first frame.
  if (/^rgba\(.*,\s*0\)$|^transparent$/.test(cs.backgroundColor)) {
    const behind = backgroundBehind(input.parentElement);
    if (behind) style.backgroundColor = `rgb(${behind.join(', ')})`;
  }
  return style;
}

interface Layout {
  /** Where the sheet sits while its input covers Scryfall's… */
  top: number;
  /** …and where it glides to, making room for the panel below. */
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
  // Centred on the box, but kept EDGE clear of the viewport sides (the header box sits well left of centre).
  const left = Math.max(Math.min(EDGE, (vw - width) / 2), Math.min(r.left + r.width / 2 - width / 2, vw - EDGE - width));
  // Near the top (the header box) it drops down a little; lower (the homepage) it rises.
  const finalTop = Math.max(EDGE, Math.min(r.top - PAD, Math.round(vh * LIFT_TO)));
  const onScreen = r.bottom > 0 && r.top < vh;
  return {
    top: onScreen ? r.top - PAD : finalTop - OFFSCREEN_TRAVEL,
    finalTop,
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

/** Snapshots decorations over the box, positioned relative to the box itself, so they ride along as it widens. */
function copyAdornments(elements: Element[], input: HTMLInputElement): Adornment[] {
  const box = input.getBoundingClientRect();
  return elements.map((el) => {
    const r = el.getBoundingClientRect();
    return { html: el.outerHTML, left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height };
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

/**
 * Hides Scryfall's box (and its logo) while the copy is up: once the copy glides
 * away, the original would otherwise show through the backdrop as a ghost.
 */
function hideAll(elements: Element[]): () => void {
  const styled = elements.filter((el): el is HTMLElement | SVGElement => 'style' in el);
  const prev = styled.map((el) => el.style.visibility);
  for (const el of styled) el.style.visibility = 'hidden';
  return () => styled.forEach((el, i) => (el.style.visibility = prev[i] ?? ''));
}

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
 * builder reads the query and edits it in place: the query is the one source of
 * truth, so the form comes back filled in after a reload.
 */
export function SearchModal({ input, adornments, submit }: SearchModalProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [closing, setClosing] = useState(false);
  const [value, setValue] = useState('');
  const reading = useMemo(() => readQuery(value), [value]);
  const sets = useSets();
  const mirrorRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);
  const refocusing = useRef(false);
  const closeTimer = useRef(0);
  const unhide = useRef<(() => void) | null>(null);
  const reveal = () => {
    unhide.current?.();
    unhide.current = null;
  };

  /** Writes into Scryfall's box. No input event while open: nothing should react behind the sheet. */
  const sync = (next: string) => {
    setValue(next);
    input.value = next;
  };

  /** Tears the sheet down once the close animation has put the copy back on Scryfall's box. */
  const finish = (refocus: boolean) => {
    window.clearTimeout(closeTimer.current);
    const mirror = mirrorRef.current;
    const end = input.value.length;
    const selection = [mirror?.selectionStart ?? end, mirror?.selectionEnd ?? end] as const;
    openRef.current = false;
    setClosing(false);
    setSession(null);
    reveal(); // before focusing: a hidden input can't take focus
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (!refocus) return;
    refocusing.current = true;
    input.focus();
    input.setSelectionRange(selection[0], selection[1]);
    refocusing.current = false;
  };

  /**
   * Plays the opening backwards, then hands over. The copy keeps focus meanwhile,
   * so anything typed during those few frames still lands in the query.
   */
  const close = (refocus: boolean) => {
    if (!openRef.current || closeTimer.current) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = 0;
      finish(refocus);
    }, reducedMotion() ? 0 : CLOSE_MS);
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
      const covered = adornments?.() ?? [];
      const next: Session = {
        layout,
        adornments: copyAdornments(covered, input),
        style: mirrorStyle(input),
        placeholder: input.placeholder,
        selection: [input.selectionStart ?? len, input.selectionEnd ?? len],
      };
      openRef.current = true;
      input.blur();
      unhide.current = hideAll([input, ...covered]);
      setValue(input.value);
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
        closeTimer.current = 0;
        finish(false);
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
      window.clearTimeout(closeTimer.current);
      reveal();
    };
  }, [input, adornments]);

  // Hand focus and caret over to the copy in the same frame the sheet appears.
  useLayoutEffect(() => {
    if (!session) return;
    const mirror = mirrorRef.current;
    mirror?.focus();
    mirror?.setSelectionRange(session.selection[0], session.selection[1]);
    const unlock = lockScroll();
    const onResize = () => {
      const layout = measure(input);
      setSession((s) => (s ? { ...s, layout } : s));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      unlock();
    };
  }, [session !== null]);

  if (!session) return null;
  const { layout } = session;
  // The animations start (and closing ends) exactly on Scryfall's box: shifted back
  // to where it sits and clipped down to it. See the search modal part of styles.css.
  const motion = {
    '--sqb-shift': `${layout.top - layout.finalTop}px`,
    '--sqb-in-top': `${PAD}px`,
    '--sqb-in-left': `${layout.inputLeft}px`,
    '--sqb-in-right': `${layout.width - layout.inputLeft - layout.inputWidth}px`,
    '--sqb-in-bottom': `${PAD + layout.inputHeight}px`,
    '--sqb-in-radius': session.style.borderTopLeftRadius ?? '0px',
    '--sqb-head': `${PAD + layout.inputHeight + HEAD_BELOW}px`,
    // The box then widens from Scryfall's size to the full sheet.
    '--sqb-box-left': `${layout.inputLeft - BORDER}px`,
    '--sqb-box-width': `${layout.inputWidth}px`,
  };

  // Edits start from Scryfall's box: sync keeps it current, even between renders.
  const edit = (update: (state: QueryState) => QueryState) => sync(writeQuery(input.value, update(readQuery(input.value).state)));
  /** The button that had focus is gone with its pin: give focus back to the query, not to Scryfall's shortcuts. */
  const refocus = () => mirrorRef.current?.focus();
  const remove = (condition: Condition) => {
    sync(removeCondition(input.value, condition));
    refocus();
  };
  const clear = () => {
    sync('');
    refocus();
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
    <div class={`sqb-modal${closing ? ' sqb-closing' : ''}`}>
      <div class="sqb-backdrop" onClick={() => close(false)} />
      <div
        class="sqb-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        style={{
          ...motion,
          top: `${layout.finalTop}px`,
          left: `${layout.left}px`,
          width: `${layout.width}px`,
          maxHeight: `calc(100vh - ${layout.finalTop + EDGE}px)`,
        }}
        onKeyDown={onSheetKeyDown}
        onKeyPress={stopKey}
        onKeyUp={stopKey}
      >
        <div class="sqb-sheet-head">
          <div class="sqb-box">
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
              style={{ ...session.style, height: `${layout.inputHeight}px` }}
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
        </div>

        <div class="sqb-sheet-body">
          <section class="sqb-stack">
            <QueryBuilder
              query={value}
              state={reading.state}
              onChange={edit}
              extras={reading.extras}
              onRemove={remove}
              onClear={clear}
              onSearch={submit}
              sets={sets}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
