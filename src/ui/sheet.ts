import { backgroundBehind } from './theme';

// These match the box model and close animation of .sqb-sheet and .sqb-sheet-head in styles.css.
const SHEET_PADDING = 12;
const SHEET_BORDER = 1;
const HEAD_BELOW_INPUT = 13;
export const CLOSE_MS = 180;

const SHEET_WIDTH = 1000;
const VIEWPORT_MARGIN = 16;
const RESTING_TOP_RATIO = 0.12;
const OFFSCREEN_DROP = 48;

const MIRRORED_PROPERTIES = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textAlign', 'textIndent', 'textTransform',
  'color', 'caretColor', 'backgroundColor', 'backgroundImage', 'backgroundPosition', 'backgroundSize', 'backgroundRepeat',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'boxShadow', 'outlineWidth', 'outlineStyle', 'outlineColor', 'outlineOffset',
] as const;

export type MirrorStyle = Partial<Record<(typeof MIRRORED_PROPERTIES)[number], string>>;

export interface Layout {
  startTop: number;
  restingTop: number;
  left: number;
  width: number;
  inputLeft: number;
  inputWidth: number;
  inputHeight: number;
}

export interface Adornment {
  html: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function measureLayout(input: HTMLInputElement): Layout {
  const box = input.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const width = clamp(Math.min(box.width, viewportWidth), Math.max(SHEET_WIDTH, box.width + 2 * SHEET_PADDING), viewportWidth - 2 * VIEWPORT_MARGIN);
  const centeredLeft = box.left + box.width / 2 - width / 2;
  const left = clamp(Math.min(VIEWPORT_MARGIN, (viewportWidth - width) / 2), centeredLeft, viewportWidth - VIEWPORT_MARGIN - width);
  const restingTop = clamp(VIEWPORT_MARGIN, box.top - SHEET_PADDING, Math.round(viewportHeight * RESTING_TOP_RATIO));
  const onScreen = box.bottom > 0 && box.top < viewportHeight;
  return {
    startTop: onScreen ? box.top - SHEET_PADDING : restingTop - OFFSCREEN_DROP,
    restingTop,
    left,
    width,
    inputLeft: box.left - left,
    inputWidth: box.width,
    inputHeight: box.height,
  };
}

export function mirrorStyle(input: HTMLInputElement): MirrorStyle {
  // Read with transitions off, so a focus ring still animating in is read at its final value.
  const transition = input.style.transition;
  input.style.transition = 'none';
  const computed = getComputedStyle(input);
  const style: MirrorStyle = {};
  for (const property of MIRRORED_PROPERTIES) style[property] = computed[property];
  input.style.transition = transition;

  if (isTransparent(style.backgroundColor ?? '')) {
    const behind = backgroundBehind(input.parentElement);
    if (behind) style.backgroundColor = `rgb(${behind.join(', ')})`;
  }
  return style;
}

export function snapshotAdornments(elements: Element[], input: HTMLInputElement): Adornment[] {
  const box = input.getBoundingClientRect();
  return elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { html: element.outerHTML, left: rect.left - box.left, top: rect.top - box.top, width: rect.width, height: rect.height };
  });
}

export function sheetStyle(layout: Layout, inputRadius: string): Record<string, string> {
  return {
    top: `${layout.restingTop}px`,
    left: `${layout.left}px`,
    width: `${layout.width}px`,
    maxHeight: `calc(100vh - ${layout.restingTop + VIEWPORT_MARGIN}px)`,
    '--sqb-start-shift': `${layout.startTop - layout.restingTop}px`,
    '--sqb-input-top': `${SHEET_PADDING}px`,
    '--sqb-input-left': `${layout.inputLeft}px`,
    '--sqb-input-right': `${layout.width - layout.inputLeft - layout.inputWidth}px`,
    '--sqb-input-bottom': `${SHEET_PADDING + layout.inputHeight}px`,
    '--sqb-input-radius': inputRadius,
    '--sqb-head-height': `${SHEET_PADDING + layout.inputHeight + HEAD_BELOW_INPUT}px`,
    '--sqb-box-left': `${layout.inputLeft - SHEET_BORDER}px`,
    '--sqb-box-width': `${layout.inputWidth}px`,
  };
}

export function hideElements(elements: Element[]): () => void {
  const styled = elements.filter((element): element is HTMLElement | SVGElement => 'style' in element);
  const previous = styled.map((element) => element.style.visibility);
  for (const element of styled) element.style.visibility = 'hidden';
  return () => {
    for (const [i, element] of styled.entries()) element.style.visibility = previous[i] ?? '';
  };
}

export function lockPageScroll(): () => void {
  const html = document.documentElement;
  const scrollbarWidth = window.innerWidth - html.clientWidth;
  const previous = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
  html.style.overflow = 'hidden';
  if (scrollbarWidth > 0) html.style.paddingRight = `${scrollbarWidth}px`;
  return () => {
    html.style.overflow = previous.overflow;
    html.style.paddingRight = previous.paddingRight;
  };
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function isTransparent(color: string): boolean {
  return /^rgba\(.*,\s*0\)$|^transparent$/.test(color);
}
