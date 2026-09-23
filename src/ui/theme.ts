/**
 * Scryfall renders its theme server-side and puts no class on <html>/<body> we
 * could read — its homepage hero is dark for every visitor, painted by a
 * gradient, while the `.main` element behind it is light. So the panel matches
 * what is actually painted behind it: walk up from the mount point to the first
 * ancestor that paints a background (colour or gradient) and pick by luminance.
 * That keeps working whatever Scryfall does to its own themes.
 */

type Rgb = [number, number, number];

function parseRgb(value: string): { rgb: Rgb; alpha: number } | null {
  const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i);
  if (!m) return null;
  const raw = m[4];
  const alpha = raw == null ? 1 : raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number.isFinite(alpha) ? alpha : 1 };
}

/** Average of the colour stops in a gradient — close enough to judge dark vs light. */
function averageGradientColor(backgroundImage: string): Rgb | null {
  if (!backgroundImage.includes('gradient(')) return null;
  const stops: Rgb[] = [];
  for (const match of backgroundImage.matchAll(/rgba?\([^)]*\)/gi)) {
    const parsed = parseRgb(match[0]);
    if (parsed && parsed.alpha > 0.2) stops.push(parsed.rgb);
  }
  if (stops.length === 0) return null;
  const sum = stops.reduce<Rgb>((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0]);
  return [sum[0] / stops.length, sum[1] / stops.length, sum[2] / stops.length];
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function backgroundBehind(start: Element | null): Rgb | null {
  for (let node: Element | null = start; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    // Anything close to transparent lets the layer below show through; keep going.
    const color = parseRgb(style.backgroundColor);
    if (color && color.alpha > 0.2) return color.rgb;
    const gradient = averageGradientColor(style.backgroundImage);
    if (gradient) return gradient;
  }
  return null;
}

export function hostTheme(host: Element | null): 'dark' | 'light' | null {
  const rgb = backgroundBehind(host?.parentElement ?? document.body ?? null);
  if (!rgb) return null;
  return luminance(rgb) < 0.4 ? 'dark' : 'light';
}

export function applyHostTheme(host: HTMLElement): void {
  const theme = hostTheme(host);
  if (theme) host.dataset.theme = theme;
  else delete host.dataset.theme;
}

/** Re-reads the background when Scryfall restyles the page under us. */
export function watchHostTheme(host: HTMLElement): () => void {
  applyHostTheme(host);
  const observer = new MutationObserver(() => applyHostTheme(host));
  const options: MutationObserverInit = { attributes: true, attributeFilter: ['class', 'style'] };
  observer.observe(document.documentElement, options);
  if (document.body) observer.observe(document.body, options);
  return () => observer.disconnect();
}
