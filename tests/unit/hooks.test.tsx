import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { useEvent } from '../../src/components/useEvent';

function mount<P extends object>(Component: (props: P) => null, props: P) {
  const root = document.createElement('div');
  act(() => render(<Component {...props} />, root));
  return (next: P) => act(() => render(<Component {...next} />, root));
}

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
