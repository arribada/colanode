import { createLink, LinkComponent } from '@tanstack/react-router';
import * as React from 'react';

import { useApp } from '@colanode/ui/contexts/app';
import { useLayout } from '@colanode/ui/contexts/layout';

const isNewTabClick = (
  event: React.MouseEvent<HTMLAnchorElement>,
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>['target']
) => {
  if (target === '_blank') {
    return true;
  }

  return event.metaKey || event.ctrlKey || event.shiftKey || event.button === 2;
};

const DesktopLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement>
>((props, ref) => {
  const layout = useLayout();
  const { onClick, target, href, children, ...rest } = props;

  return (
    <a
      ref={ref}
      {...rest}
      href={href}
      target={target}
      onClick={(e) => {
        // Give the composed handler (e.g. a mention opening a modal on
        // Shift-click) first refusal; if it handled the click, do not also
        // open a new tab.
        onClick?.(e);
        if (e.defaultPrevented) {
          return;
        }

        if (href && isNewTabClick(e, target)) {
          e.preventDefault();
          e.stopPropagation();
          layout.openInNewTab(href as string);
        }
      }}
    >
      {children}
    </a>
  );
});

const BasicLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement>
>((props, ref) => {
  const app = useApp();
  const { children, ...rest } = props;

  if (app.type === 'desktop') {
    return (
      <DesktopLinkComponent ref={ref} {...props} data-router-link="true" />
    );
  }

  return (
    <a ref={ref} {...rest} data-router-link="true">
      {children}
    </a>
  );
});

const CreatedLinkComponent = createLink(BasicLinkComponent);

export const Link: LinkComponent<typeof BasicLinkComponent> = (props) => {
  return <CreatedLinkComponent {...props} />;
};
