export function afterAnimation(durationMs: number, callback: () => void): number {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return window.setTimeout(callback, reducedMotion ? 0 : durationMs);
}
