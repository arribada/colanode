import { Link, LinkOptions } from '@tiptap/extension-link';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { defaultClasses } from '@colanode/ui/editor/classes';

export type LinkClickMode = 'same' | 'newtab' | 'modal';
// Returns true if it handled the navigation (the click is then swallowed).
export type LinkClickHandler = (href: string, mode: LinkClickMode) => boolean;

export interface LinkMarkOptions extends LinkOptions {
  onLinkClick?: LinkClickHandler;
}

export const LinkMark = Link.extend<LinkMarkOptions>({
  inclusive: false,

  addOptions() {
    return {
      ...this.parent?.(),
      onLinkClick: undefined,
    } as LinkMarkOptions;
  },

  addProseMirrorPlugins() {
    const plugins = this.parent?.() || [];
    const editor = this.editor;
    const options = this.options;

    return [
      new Plugin({
        key: new PluginKey('handleRouterClickLink'),
        props: {
          handleClick: (_, __, event) => {
            let link: HTMLAnchorElement | null = null;

            if (event.target instanceof HTMLAnchorElement) {
              link = event.target;
            } else {
              const target = event.target as HTMLElement | null;
              if (!target) {
                return false;
              }
              // Limit the lookup to the editor root; using tag names as
              // boundaries breaks with custom NodeViews.
              link = target.closest<HTMLAnchorElement>('a');
              if (link && !editor.view.dom.contains(link)) {
                link = null;
              }
            }

            if (!link) {
              return false;
            }

            // Tanstack Router links handle their own navigation.
            if (link.dataset.routerLink === 'true') {
              return true;
            }

            const href = link.getAttribute('href');
            const onLinkClick = options.onLinkClick;
            if (!href || !onLinkClick) {
              return false;
            }

            const mouse = event as MouseEvent;
            const mode: LinkClickMode = mouse.shiftKey
              ? 'modal'
              : mouse.ctrlKey || mouse.metaKey || mouse.button === 1
                ? 'newtab'
                : 'same';

            if (onLinkClick(href, mode)) {
              event.preventDefault();
              return true;
            }

            return false;
          },
        },
      }),
      ...plugins,
    ];
  },
}).configure({
  autolink: true,
  enableClickSelection: false,
  // We route clicks ourselves (above): tiptap's default openOnClick does
  // window.open(), which always spawns a new tab -- the behaviour we replace.
  openOnClick: false,
  HTMLAttributes: {
    class: defaultClasses.link,
  },
});
