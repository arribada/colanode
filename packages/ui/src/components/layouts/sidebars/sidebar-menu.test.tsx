import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The sidebar menu depends on workspace/radar contexts and live queries that
// require running providers. For this regression test we only care about the
// static markup the component produces (specifically the accessible name of the
// settings control), so we stub those hooks and the header/footer children with
// the minimal shape SidebarMenu reads.
vi.mock('@colanode/ui/contexts/workspace', () => ({
  useWorkspace: () => ({
    userId: 'user-1',
    collections: { uploads: {} },
  }),
}));

vi.mock('@colanode/ui/contexts/radar', () => ({
  useRadar: () => ({
    getChatsState: () => ({ unreadCount: 0, hasUnread: false }),
    getChannelsState: () => ({ unreadCount: 0, hasUnread: false }),
  }),
}));

vi.mock('@colanode/ui/hooks/use-live-query', () => ({
  useLiveQuery: () => ({ data: 0 }),
}));

vi.mock('@tanstack/react-db', () => ({
  count: () => 0,
  inArray: () => true,
  useLiveQuery: () => ({ data: { count: 0 } }),
}));

vi.mock('@colanode/ui/components/layouts/sidebars/sidebar-menu-header', () => ({
  SidebarMenuHeader: () => null,
}));

vi.mock('@colanode/ui/components/layouts/sidebars/sidebar-menu-footer', () => ({
  SidebarMenuFooter: () => null,
}));

import { SidebarMenu } from '@colanode/ui/components/layouts/sidebars/sidebar-menu';

describe('SidebarMenu', () => {
  it('labels the settings control with the correctly spelled "Settings"', () => {
    const markup = renderToStaticMarkup(
      <SidebarMenu value="chats" onChange={() => {}} />
    );

    // Regression for issue #10: the settings button's accessible name (aria-label)
    // was misspelled "Setings??", so a role+name query for "Settings" matched
    // nothing. The label must read exactly "Settings".
    expect(markup).toContain('aria-label="Settings"');
    expect(markup).not.toContain('Setings??');
  });

  it('labels the chats control with the correctly spelled "Chats"', () => {
    const markup = renderToStaticMarkup(
      <SidebarMenu value="chats" onChange={() => {}} />
    );

    // Regression for issue #14: the chats button is icon-only, so its aria-label
    // is its sole accessible name. It was misspelled "Chatts" (extra "t"), so a
    // role+name query for "Chats" matched nothing. The label must read exactly
    // "Chats".
    expect(markup).toContain('aria-label="Chats"');
    expect(markup).not.toContain('Chatts');
  });

  it('renders a search control that opens the workspace-wide search', () => {
    const markup = renderToStaticMarkup(
      <SidebarMenu value="chats" onChange={() => {}} />
    );

    // The search button is icon-only, so its aria-label is its sole accessible
    // name; the cmd-K dialog relies on it as the pointer-driven entry point.
    expect(markup).toContain('aria-label="Search"');
  });
});
