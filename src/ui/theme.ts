// Scryfall exposes no theme class, and its homepage hero is dark while the page behind it is light,
// so the theme follows the background actually painted behind the search form.

type Rgb = [number, number, number];

const VISIBLE_ALPHA = 0.2;
const DARK_BELOW_LUMINANCE = 0.4;

export function backgroundBehind(start: Element | null): Rgb | null {
  for (let node = start; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const color = parseRgb(style.backgroundColor);
    if (color && color.alpha > VISIBLE_ALPHA) return color.rgb;
    const gradient = averageGradientColor(style.backgroundImage);
    if (gradient) return gradient;
  }
  return null;
}

export function hostTheme(host: Element | null, themeSource?: Element): 'dark' | 'light' | null {
  const rgb = backgroundBehind(themeSource ?? host?.parentElement ?? document.body ?? null);
  if (!rgb) return null;
  return relativeLuminance(rgb) < DARK_BELOW_LUMINANCE ? 'dark' : 'light';
}

export function watchHostTheme(host: HTMLElement, themeSource?: Element): () => void {
  const apply = () => {
    const theme = hostTheme(host, themeSource);
    if (theme) host.dataset.theme = theme;
    else delete host.dataset.theme;
  };
  apply();
  const observer = new MutationObserver(apply);
  const options: MutationObserverInit = { attributes: true, attributeFilter: ['class', 'style'] };
  observer.observe(document.documentElement, options);
  if (document.body) observer.observe(document.body, options);
  return () => observer.disconnect();
}

function parseRgb(value: string): { rgb: Rgb; alpha: number } | null {
  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i);
  if (!match) return null;
  const rawAlpha = match[4];
  const alpha =
    rawAlpha == null ? 1 : rawAlpha.endsWith('%') ? Number.parseFloat(rawAlpha) / 100 : Number.parseFloat(rawAlpha);
  return { rgb: [Number(match[1]), Number(match[2]), Number(match[3])], alpha: Number.isFinite(alpha) ? alpha : 1 };
}

function averageGradientColor(backgroundImage: string): Rgb | null {
  if (!backgroundImage.includes('gradient(')) return null;
  const stops: Rgb[] = [];
  for (const [color] of backgroundImage.matchAll(/rgba?\([^)]*\)/gi)) {
    const parsed = parseRgb(color);
    if (parsed && parsed.alpha > VISIBLE_ALPHA) stops.push(parsed.rgb);
  }
  if (stops.length === 0) return null;
  const sum = stops.reduce<Rgb>((total, [r, g, b]) => [total[0] + r, total[1] + g, total[2] + b], [0, 0, 0]);
  return [sum[0] / stops.length, sum[1] / stops.length, sum[2] / stops.length];
}

function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
