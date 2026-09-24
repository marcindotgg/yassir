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

    // WXT reports this from the Navigation API's navigate event, which also fires
    // as a search (or a link) starts loading another page — with this one still
    // up, sheet and all. Only remount once this document's own URL has moved
    // (pushState and the like); a page on its way out is left as it is.
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      ctx.setTimeout(() => {
        if (location.href === newUrl.href) void start();
      });
    });
    ctx.onInvalidated(() => cleanup?.());
    void start();
  },
});
