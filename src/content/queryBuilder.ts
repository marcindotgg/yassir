import type { ContentScriptContext } from '#imports';
import { h } from 'preact';
import { QueryBuilder } from '../components/QueryBuilder';
import { mountPanel } from '../ui/mount';
import { isHomePage, SCRYFALL } from './selectors';

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
 * Mounts the query builder under Scryfall's homepage search form. Returns a
 * cleanup so a location change can tear it down and try again.
 */
export async function mountQueryBuilder(ctx: ContentScriptContext): Promise<() => void> {
  if (!isHomePage(new URL(location.href))) return () => {};

  const form = await waitForElement<HTMLFormElement>(ctx, SCRYFALL.homeForm);
  const input = form?.querySelector<HTMLInputElement>(SCRYFALL.homeInput);
  if (!form || !input || ctx.isInvalid) return () => {};

  const ui = await mountPanel(ctx, {
    name: 'scryfall-query-builder',
    anchor: form,
    append: 'after',
    render: () =>
      h(QueryBuilder, {
        getSearchValue: () => input.value,
        setSearchValue: (query, submit) => {
          input.value = query;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
          if (submit) form.requestSubmit ? form.requestSubmit() : form.submit();
        },
      }),
  });

  return () => ui.remove();
}
