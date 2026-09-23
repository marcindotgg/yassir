import { createShadowRootUi, type ContentScriptContext, type ShadowRootContentScriptUi } from '#imports';
import { render, type ComponentChild } from 'preact';
import { watchHostTheme } from './theme';

export interface MountOptions {
  /** kebab-case custom element name hosting the shadow root */
  name: string;
  anchor: string | Element | null | (() => Element | null);
  append?: 'last' | 'first' | 'before' | 'after' | 'replace';
  render: (container: HTMLElement) => ComponentChild;
  /** Take the theme from what this element sits on, instead of the host's parent. */
  themeFrom?: Element;
}

/**
 * Mounts a Preact tree inside a WXT shadow-root UI, so Scryfall's stylesheet and
 * ours cannot reach into each other. The content script must import the CSS and
 * declare `cssInjectionMode: 'ui'` for it to land inside the shadow root; the
 * host element itself is laid out by the `:host` rule in styles.css, because
 * Scryfall's CSP throws away `style` attributes.
 */
export async function mountPanel(
  ctx: ContentScriptContext,
  options: MountOptions,
): Promise<ShadowRootContentScriptUi<() => void>> {
  const ui = await createShadowRootUi<() => void>(ctx, {
    name: options.name,
    position: 'inline',
    anchor: options.anchor,
    append: options.append ?? 'last',
    onMount: (container, _shadow, host) => {
      const unwatchTheme = watchHostTheme(host as HTMLElement, options.themeFrom);
      const root = document.createElement('div');
      root.className = 'sqb-root';
      container.append(root);
      render(options.render(root), root);
      return () => {
        unwatchTheme();
        render(null, root);
      };
    },
    onRemove: (unmount) => unmount?.(),
  });
  ui.mount();
  return ui;
}
