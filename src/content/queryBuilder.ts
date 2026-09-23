import type { ContentScriptContext } from '#imports';
import { h } from 'preact';
import { SearchModal } from '../components/SearchModal';
import { mountPanel } from '../ui/mount';
import { searchBoxFor } from './selectors';

/** Resolves once `selector` exists, or with null after `timeoutMs`. */
function waitForElement<T extends Element>(ctx: ContentScriptContext, selector: string, timeoutMs = 10000): Promise<T | null> {
  const found = document.querySelector<T>(selector);
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    let done = false;
    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      observer.disconnect();
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector);
      if (el) finish(el);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ctx.setTimeout(() => finish(document.querySelector<T>(selector)), timeoutMs);
    ctx.onInvalidated(() => finish(null));
  });
}

/**
 * Hooks the search modal onto Scryfall's search box: the big one on the
 * homepage, the header one everywhere else. The host goes at
 * the end of <body> so no ancestor of the form can clip or transform the fixed
 * overlay. Returns a cleanup so a location change can tear it down and try again.
 */
export async function mountQueryBuilder(ctx: ContentScriptContext): Promise<() => void> {
  const box = searchBoxFor(new URL(location.href));
  const form = await waitForElement<HTMLFormElement>(ctx, box.form);
  const input = form?.querySelector<HTMLInputElement>(box.input);
  if (!form || !input || ctx.isInvalid) return () => {};

  const ui = await mountPanel(ctx, {
    name: 'scryfall-query-builder',
    anchor: 'body',
    append: 'last',
    // The sheet covers the hero, so it takes its theme from there, not from <body>.
    themeFrom: form,
    render: () =>
      h(SearchModal, {
        input,
        adornments: () => (box.adornments ? [...form.querySelectorAll(box.adornments)] : []),
        submit: () => (form.requestSubmit ? form.requestSubmit() : form.submit()),
      }),
  });

  return () => ui.remove();
}
