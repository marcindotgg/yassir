import '../src/ui/styles.css';
import { defineContentScript } from '#imports';
import { mountSearchModal } from '../src/content/mount';

export default defineContentScript({
  matches: ['https://scryfall.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  main(ctx) {
    let unmount: (() => void) | null = null;
    let generation = 0;

    const remount = async () => {
      const current = ++generation;
      unmount?.();
      unmount = null;
      if (ctx.isInvalid) return;
      const remove = await mountSearchModal(ctx);
      if (current !== generation || ctx.isInvalid) remove();
      else unmount = remove;
    };

    // WXT also reports a search that starts loading another page, while this one is still up:
    // remount only once this document's own URL has changed.
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      ctx.setTimeout(() => {
        if (location.href === newUrl.href) void remount();
      });
    });
    ctx.onInvalidated(() => unmount?.());
    void remount();
  },
});
