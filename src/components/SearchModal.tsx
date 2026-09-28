import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type Condition, readQuery, removeCondition, writeQuery } from '../lib/query-sync';
import type { QueryState } from '../lib/scryfall-syntax';
import { afterAnimation } from '../ui/motion';
import {
  type Adornment,
  CLOSE_MS,
  hideElements,
  type Layout,
  lockPageScroll,
  type MirrorStyle,
  measureLayout,
  mirrorStyle,
  sheetStyle,
  snapshotAdornments,
} from '../ui/sheet';
import { QueryBuilder } from './QueryBuilder';
import { useEvent } from './useEvent';
import { useSets } from './useSets';

interface SearchModalProps {
  input: HTMLInputElement;
  adornments?: () => Element[];
  submit: () => void;
}

interface Session {
  layout: Layout;
  adornments: Adornment[];
  style: MirrorStyle;
  placeholder: string;
  selection: [number, number];
}

// Scryfall binds single-letter shortcuts on the document. A key typed in our shadow root reaches it
// with the shadow host as its target, not an input, so it would be taken for a shortcut.
const stopKey = (event: KeyboardEvent) => event.stopPropagation();

export function SearchModal({ input, adornments, submit }: SearchModalProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState({ value: '', typing: false, searching: false });
  const reading = useMemo(() => readQuery(query.value), [query.value]);
  const setList = useSets();
  const mirrorRef = useRef<HTMLInputElement>(null);
  const isOpen = useRef(false);
  const isRefocusingInput = useRef(false);
  const closeTimer = useRef(0);
  const restoreOriginal = useRef<(() => void) | null>(null);

  const revealOriginal = useEvent(() => {
    restoreOriginal.current?.();
    restoreOriginal.current = null;
  });

  const updateQuery = (value: string, typing = false) => {
    setQuery({ value, typing, searching: false });
    input.value = value;
  };

  const search = () => {
    submit();
    setQuery((current) => ({ ...current, searching: true }));
  };

  const teardown = useEvent((refocusInput: boolean) => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = 0;
    const end = input.value.length;
    const selectionStart = mirrorRef.current?.selectionStart ?? end;
    const selectionEnd = mirrorRef.current?.selectionEnd ?? end;
    isOpen.current = false;
    setClosing(false);
    setSession(null);
    revealOriginal(); // before focusing it: a hidden input can't take focus
    // Scryfall's own listeners hear about the edits only now, so nothing reacts behind the open sheet.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (!refocusInput) return;
    isRefocusingInput.current = true;
    input.focus();
    input.setSelectionRange(selectionStart, selectionEnd);
    isRefocusingInput.current = false;
  });

  const close = (refocusInput: boolean) => {
    if (!isOpen.current || closeTimer.current) return;
    setClosing(true);
    closeTimer.current = afterAnimation(CLOSE_MS, () => teardown(refocusInput));
  };

  useEffect(() => {
    const open = () => {
      if (isOpen.current) {
        mirrorRef.current?.focus();
        return;
      }
      if (isRefocusingInput.current) return;
      const covered = adornments?.() ?? [];
      const end = input.value.length;
      const next: Session = {
        layout: measureLayout(input),
        adornments: snapshotAdornments(covered, input),
        style: mirrorStyle(input),
        placeholder: input.placeholder,
        selection: [input.selectionStart ?? end, input.selectionEnd ?? end],
      };
      isOpen.current = true;
      input.blur();
      restoreOriginal.current = hideElements([input, ...covered]);
      setQuery({ value: input.value, typing: false, searching: false });
      setSession(next);
    };
    const openOnClickWhileFocused = () => {
      if (!isOpen.current && document.activeElement === input) open();
    };
    const followExternalInput = () => {
      if (isOpen.current && input.value !== mirrorRef.current?.value)
        setQuery((current) => ({ ...current, value: input.value, typing: true }));
    };
    const closeOnBackForwardRestore = (event: PageTransitionEvent) => {
      if (event.persisted && isOpen.current) teardown(false);
    };

    input.addEventListener('focus', open);
    input.addEventListener('click', openOnClickWhileFocused);
    input.addEventListener('input', followExternalInput);
    window.addEventListener('pageshow', closeOnBackForwardRestore);
    return () => {
      input.removeEventListener('focus', open);
      input.removeEventListener('click', openOnClickWhileFocused);
      input.removeEventListener('input', followExternalInput);
      window.removeEventListener('pageshow', closeOnBackForwardRestore);
      window.clearTimeout(closeTimer.current);
      revealOriginal();
    };
  }, [input, adornments]);

  const sheetIsOpen = session !== null;
  useLayoutEffect(() => {
    if (!session) return;
    mirrorRef.current?.focus();
    mirrorRef.current?.setSelectionRange(...session.selection);
    const unlockScroll = lockPageScroll();
    const relayout = () => {
      const layout = measureLayout(input);
      setSession((current) => current && { ...current, layout });
    };
    window.addEventListener('resize', relayout);
    return () => {
      window.removeEventListener('resize', relayout);
      unlockScroll();
    };
  }, [sheetIsOpen]);

  if (!session) return null;

  // Starts from input.value, not from state: it is current even between renders.
  const edit = (update: (state: QueryState) => QueryState) =>
    updateQuery(writeQuery(input.value, update(readQuery(input.value).state)));
  const keepFocusInSheet = () => mirrorRef.current?.focus();
  const remove = (condition: Condition) => {
    updateQuery(removeCondition(input.value, condition));
    keepFocusInSheet();
  };
  const clear = () => {
    updateQuery('');
    keepFocusInSheet();
  };

  const searchOnEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      search();
    }
  };

  const onSheetKeyDown = (event: KeyboardEvent) => {
    // A dropdown that handled Escape has already closed itself.
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      close(true);
    }
    stopKey(event);
  };

  const { layout } = session;
  return (
    <div class={`sqb-modal${closing ? ' sqb-closing' : ''}`}>
      <div class="sqb-backdrop" onClick={() => close(false)} />
      <div
        class="sqb-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        style={sheetStyle(layout, session.style.borderTopLeftRadius ?? '0px')}
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
              value={query.value}
              onInput={(e) => updateQuery(e.currentTarget.value, true)}
              onKeyDown={searchOnEnter}
              style={{ ...session.style, height: `${layout.inputHeight}px` }}
            />
            {session.adornments.map((adornment, i) => (
              <span
                key={i}
                class="sqb-adornment"
                aria-hidden="true"
                style={{
                  left: `${adornment.left}px`,
                  top: `${adornment.top}px`,
                  width: `${adornment.width}px`,
                  height: `${adornment.height}px`,
                }}
                // Scryfall's own markup (the logo's inline SVG), copied from the page.
                dangerouslySetInnerHTML={{ __html: adornment.html }}
              />
            ))}
          </div>
        </div>

        <div class="sqb-sheet-body">
          <section class="sqb-stack">
            <QueryBuilder
              query={query.value}
              state={reading.state}
              onChange={edit}
              otherConditions={reading.otherConditions}
              typing={query.typing}
              searching={query.searching}
              setList={setList}
              onRemove={remove}
              onClear={clear}
              onSearch={search}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
