import { createRoute, redirect } from '@tanstack/react-router';

import { WorkspaceTrashContainer } from '@colanode/ui/components/workspaces/trash/workspace-trash-container';
import { WorkspaceTrashTab } from '@colanode/ui/components/workspaces/trash/workspace-trash-tab';
import { getWorkspaceUserId } from '@colanode/ui/routes/utils';
import {
  workspaceRoute,
  workspaceMaskRoute,
} from '@colanode/ui/routes/workspace';

export const workspaceTrashRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/trash',
  component: WorkspaceTrashContainer,
  context: () => {
    return {
      tab: <WorkspaceTrashTab />,
    };
  },
});

export const workspaceTrashMaskRoute = createRoute({
  getParentRoute: () => workspaceMaskRoute,
  path: '/trash',
  component: () => null,
  beforeLoad: (ctx) => {
    const userId = getWorkspaceUserId(ctx.params.workspaceId);
    if (userId) {
      throw redirect({
        to: '/workspace/$userId/trash',
        params: { userId },
        replace: true,
      });
    }
  },
});
