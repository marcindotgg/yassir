import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { cycleIndex, useCursor } from '../../src/components/useCursor';
import { useEvent } from '../../src/components/useEvent';

function mount<P extends object>(Component: (props: P) => null, props: P) {
  const root = document.createElement('div');
  act(() => render(<Component {...props} />, root));
  return (next: P) => act(() => render(<Component {...next} />, root));
}

describe('useCursor', () => {
  let cursor: [number, (index: number) => void];
  const Probe = ({ word }: { word: string }) => {
    cursor = useCursor(word, -1);
    return null;
  };

  it('resets when the key changes', () => {
    const rerender = mount(Probe, { word: 'a' });
    act(() => cursor[1](3));
    expect(cursor[0]).toBe(3);
    rerender({ word: 'ab' });
    expect(cursor[0]).toBe(-1);
  });

  it('does not bring the index back when the key returns', () => {
    const rerender = mount(Probe, { word: 'a' });
    act(() => cursor[1](3));
    rerender({ word: 'ab' });
    rerender({ word: 'a' });
    expect(cursor[0]).toBe(-1);
  });
});

describe('useEvent', () => {
  it('keeps its identity and calls the latest function', () => {
    const seen: ((...args: unknown[]) => unknown)[] = [];
    const Probe = ({ value }: { value: number }) => {
      seen.push(useEvent(() => value));
      return null;
    };
    const rerender = mount(Probe, { value: 1 });
    rerender({ value: 2 });
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]?.()).toBe(2);
  });
});

describe('cycleIndex', () => {
  it('wraps around both ends', () => {
    expect(cycleIndex(2, 1, 3)).toBe(0);
    expect(cycleIndex(0, -1, 3)).toBe(2);
    expect(cycleIndex(1, 1, 3)).toBe(2);
  });

  it('enters from nothing active at either end', () => {
    expect(cycleIndex(-1, 1, 3)).toBe(0);
    expect(cycleIndex(-1, -1, 3)).toBe(2);
  });
});
