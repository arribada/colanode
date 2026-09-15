import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const theme = vi.hoisted(() => ({ mode: 'dark' as 'light' | 'dark' }));

vi.mock('@colanode/ui/contexts/theme', () => ({
  useTheme: () => ({ mode: theme.mode }),
}));

vi.mock('@colanode/ui/hooks/use-metadata', () => ({
  useMetadata: () => [undefined, () => {}],
}));

// Radix tooltips need a provider and a live render; only the button matters.
vi.mock('@colanode/ui/components/ui/tooltip', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => children;
  return {
    Tooltip: Passthrough,
    TooltipTrigger: Passthrough,
    TooltipContent: () => null,
  };
});

import {
  nextThemeMode,
  SidebarThemeToggle,
} from '@colanode/ui/components/layouts/sidebars/sidebar-theme-toggle';

describe('nextThemeMode', () => {
  it('leaves the dark navy for the white theme', () => {
    expect(nextThemeMode('dark')).toBe('light');
  });

  it('goes dark from the light theme', () => {
    expect(nextThemeMode('light')).toBe('dark');
  });
});

describe('SidebarThemeToggle', () => {
  beforeEach(() => {
    theme.mode = 'dark';
  });

  it('offers the light theme while the dark one is on screen', () => {
    const markup = renderToStaticMarkup(<SidebarThemeToggle />);
    expect(markup).toContain('aria-label="Light theme"');
  });

  it('offers the dark theme while the light one is on screen', () => {
    theme.mode = 'light';
    const markup = renderToStaticMarkup(<SidebarThemeToggle />);
    expect(markup).toContain('aria-label="Dark theme"');
  });
});
