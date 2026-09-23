import '../src/ui/styles.css';
import { defineContentScript } from '#imports';
import { mountQueryBuilder } from '../src/content/queryBuilder';

export default defineContentScript({
  matches: ['https://scryfall.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  main(ctx) {
    let cleanup: (() => void) | null = null;
    let generation = 0;

    const start = async () => {
      const gen = ++generation;
      cleanup?.();
      cleanup = null;
      if (ctx.isInvalid) return;

      const remove = await mountQueryBuilder(ctx);
      // A newer run (or an invalidated context) won the race; drop this mount.
      if (gen !== generation || ctx.isInvalid) remove();
      else cleanup = remove;
    };

    ctx.addEventListener(window, 'wxt:locationchange', () => void start());
    ctx.onInvalidated(() => cleanup?.());
    void start();
  },
});
