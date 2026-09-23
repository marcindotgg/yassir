import { describe, expect, it } from 'vitest';
import { hostTheme } from '../../src/ui/theme';

/** Builds `<div style=bg><span/></div>` and asks what theme the span would get. */
function themeFor(...backgrounds: string[]): 'dark' | 'light' | null {
  document.body.innerHTML = '';
  document.body.style.backgroundColor = 'transparent';
  let parent: HTMLElement = document.body;
  for (const bg of backgrounds) {
    const el = document.createElement('div');
    el.style.backgroundColor = bg;
    parent.append(el);
    parent = el;
  }
  const host = document.createElement('span');
  parent.append(host);
  return hostTheme(host);
}

describe('host theme', () => {
  // getComputedStyle always reports backgroundColor as rgb()/rgba() in a browser.
  it('picks by the luminance of the nearest painted background', () => {
    expect(themeFor('rgb(43, 37, 58)')).toBe('dark');
    expect(themeFor('rgb(245, 246, 247)')).toBe('light');
    expect(themeFor('rgb(0, 0, 0)')).toBe('dark');
  });

  it('looks past transparent ancestors', () => {
    expect(themeFor('rgb(17, 24, 39)', 'transparent', 'rgba(0, 0, 0, 0)')).toBe('dark');
    expect(themeFor('rgb(255, 255, 255)', 'rgba(0, 0, 0, 0.05)')).toBe('light');
  });

  it('defers to the OS preference when nothing is painted', () => {
    expect(themeFor()).toBeNull();
  });
});
