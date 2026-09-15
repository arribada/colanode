import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const install = vi.hoisted(() => ({
  availability: 'manual' as 'installed' | 'prompt' | 'manual',
}));

vi.mock('@colanode/ui/hooks/use-pwa-install', () => ({
  usePwaInstall: () => install.availability,
}));

vi.mock('@colanode/ui/lib/pwa', () => ({
  promptPwaInstall: vi.fn(),
}));

// Radix menus and tooltips assume a live client render and throw under
// renderToStaticMarkup. What is under test is which entries appear, not Radix.
vi.mock('@colanode/ui/components/ui/dropdown-menu', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => children;
  return {
    DropdownMenu: Passthrough,
    DropdownMenuTrigger: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuItem: ({
      children,
      disabled,
    }: {
      children?: ReactNode;
      disabled?: boolean;
    }) => <div data-disabled={disabled ? 'true' : undefined}>{children}</div>,
    DropdownMenuLabel: Passthrough,
    DropdownMenuSeparator: () => null,
  };
});

vi.mock('@colanode/ui/components/ui/tooltip', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => children;
  return {
    Tooltip: Passthrough,
    TooltipTrigger: Passthrough,
    TooltipContent: Passthrough,
  };
});

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

import { SidebarGetTheApp } from '@colanode/ui/components/layouts/sidebars/sidebar-get-the-app';

const render = () => renderToStaticMarkup(<SidebarGetTheApp />);

describe('SidebarGetTheApp', () => {
  beforeEach(() => {
    install.availability = 'manual';
  });

  it('always offers the desktop download, whatever the browser can do', () => {
    for (const availability of ['installed', 'prompt', 'manual'] as const) {
      install.availability = availability;
      expect(render()).toContain('Desktop app');
    }
  });

  it('offers to install from the browser when it is not installed yet', () => {
    install.availability = 'prompt';
    const markup = render();
    expect(markup).toContain('Install in this browser');
    expect(markup).not.toContain('data-disabled="true"');
  });

  it('says so, and disables the entry, when already running installed', () => {
    install.availability = 'installed';
    const markup = render();
    expect(markup).toContain('Installed as an app');
    expect(markup).toContain('data-disabled="true"');
    expect(markup).not.toContain('Install in this browser');
  });
});
