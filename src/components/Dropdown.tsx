import type { ComponentChildren, RefObject } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';

const GAP = 8;
const MIN_HEIGHT = 140;

interface DropdownListProps {
  id: string;
  anchor: RefObject<HTMLElement>;
  preferredHeight: number;
  class?: string;
  listRef?: RefObject<HTMLUListElement>;
  multiselectable?: boolean;
  children: ComponentChildren;
}

export function DropdownList({
  id,
  anchor,
  preferredHeight,
  class: className = '',
  listRef,
  multiselectable,
  children,
}: DropdownListProps) {
  const placement = useDropdownPlacement(anchor, preferredHeight);
  return (
    <ul
      ref={listRef}
      id={id}
      role="listbox"
      aria-multiselectable={multiselectable}
      class={`sqb-dropdown ${className} ${placement.up ? 'sqb-dropdown-up' : ''}`}
      style={{ maxHeight: `${placement.maxHeight}px` }}
      // Keeps the focus in the input, whose blur would close the list before the click lands.
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </ul>
  );
}

function useDropdownPlacement(anchor: RefObject<HTMLElement>, preferredHeight: number) {
  const [placement, setPlacement] = useState({ up: false, maxHeight: preferredHeight });

  useLayoutEffect(() => {
    const element = anchor.current;
    if (!element) return;
    const scrollParent = findScrollParent(element);
    const measure = () => {
      const box = element.getBoundingClientRect();
      const bounds = scrollParent?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const below = bounds.bottom - box.bottom - GAP;
      const above = box.top - bounds.top - GAP;
      const up = below < preferredHeight && above > below;
      setPlacement({ up, maxHeight: Math.max(MIN_HEIGHT, Math.min(preferredHeight, up ? above : below)) });
    };
    measure();
    scrollParent?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      scrollParent?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [anchor, preferredHeight]);

  return placement;
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
  }
  return null;
}
