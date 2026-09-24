import type { RefObject } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';

export interface DropdownPlacement {
  up: boolean;
  maxHeight: number;
}

const GAP = 8;
const MIN_HEIGHT = 140;

/**
 * Where a dropdown hanging off `anchor` fits inside the modal's scrolling body:
 * below it when there's room, above it when there's more room there. The list
 * is capped to the space it gets, so it's never cut off by the body's edge.
 */
export function useDropdownPlacement(anchor: RefObject<HTMLElement>, open: boolean, preferred: number): DropdownPlacement {
  const [placement, setPlacement] = useState<DropdownPlacement>({ up: false, maxHeight: preferred });

  useLayoutEffect(() => {
    const el = anchor.current;
    if (!open || !el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const bounds = scrollParent(el)?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const below = bounds.bottom - box.bottom - GAP;
      const above = box.top - bounds.top - GAP;
      const up = below < preferred && above > below;
      setPlacement({ up, maxHeight: Math.max(MIN_HEIGHT, Math.min(preferred, up ? above : below)) });
    };
    measure();
    const body = scrollParent(el);
    body?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      body?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [anchor, open, preferred]);

  return placement;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === 'auto' || overflowY === 'scroll') return p;
  }
  return null;
}
