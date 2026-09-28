import { h, render } from 'preact';
import { type ContentScriptContext, createShadowRootUi } from '#imports';
import { SearchModal } from '../components/SearchModal';
import { watchHostTheme } from '../ui/theme';
import { searchBoxFor } from './selectors';

export async function mountSearchModal(ctx: ContentScriptContext): Promise<() => void> {
  const box = searchBoxFor(new URL(location.href));
  const form = await waitForElement<HTMLFormElement>(ctx, box.form);
  const input = form?.querySelector<HTMLInputElement>(box.input);
  if (!form || !input || ctx.isInvalid) return () => {};

  const ui = await createShadowRootUi<() => void>(ctx, {
    name: 'scryfall-query-builder',
    position: 'inline',
    // At the end of <body>, no ancestor of the search form can clip or transform the fixed overlay.
    anchor: 'body',
    append: 'last',
    onMount: (container, _shadow, host) => {
      const unwatchTheme = watchHostTheme(host as HTMLElement, form);
      const root = document.createElement('div');
      root.className = 'sqb-root';
      container.append(root);
      render(
        h(SearchModal, {
          input,
          adornments: () => (box.adornments ? [...form.querySelectorAll(box.adornments)] : []),
          submit: () => (form.requestSubmit ? form.requestSubmit() : form.submit()),
        }),
        root,
      );
      return () => {
        unwatchTheme();
        render(null, root);
      };
    },
    onRemove: (unmount) => unmount?.(),
  });
  ui.mount();
  return () => ui.remove();
}

function waitForElement<T extends Element>(
  ctx: ContentScriptContext,
  selector: string,
  timeoutMs = 10000,
): Promise<T | null> {
  const found = document.querySelector<T>(selector);
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (element: T | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      resolve(element);
    };
    const observer = new MutationObserver(() => {
      const element = document.querySelector<T>(selector);
      if (element) settle(element);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ctx.setTimeout(() => settle(document.querySelector<T>(selector)), timeoutMs);
    ctx.onInvalidated(() => settle(null));
  });
}
