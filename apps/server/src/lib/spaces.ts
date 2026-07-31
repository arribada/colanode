import { NodeRole, WorkspaceRole } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { createLogger } from '@colanode/server/lib/logger';
import { updateNode } from '@colanode/server/lib/nodes';

const logger = createLogger('server:lib:spaces');

export const getDefaultSpaceRole = (
  workspaceRole: WorkspaceRole
): NodeRole | null => {
  if (workspaceRole === 'owner' || workspaceRole === 'admin') {
    return 'admin';
  }

  if (workspaceRole === 'collaborator') {
    return 'editor';
  }

  if (workspaceRole === 'guest') {
    return 'viewer';
  }

  return null;
};

export type AddUserToPublicSpacesInput = {
  workspaceId: string;
  userId: string;
  workspaceRole: WorkspaceRole;
  addedBy: string;
};

// When a user joins a workspace they have no collaborations yet, so their
// client would sync zero nodes. Public spaces are meant to be visible to the
// whole workspace: add the new user as a collaborator on each public space
// through the regular node update path so that node attributes, the
// collaborations table, revisions and events all stay consistent and the new
// member's client receives the existing content of those spaces.
export const addUserToPublicSpaces = async (
  input: AddUserToPublicSpacesInput
): Promise<void> => {
  const role = getDefaultSpaceRole(input.workspaceRole);
  if (!role) {
    return;
  }

  try {
    const spaces = await database
      .selectFrom('nodes')
      .select(['id', 'attributes'])
      .where('workspace_id', '=', input.workspaceId)
      .where('type', '=', 'space')
      .execute();

    for (const space of spaces) {
      const attributes = space.attributes;
      if (attributes.type !== 'space') {
        continue;
      }

      if (attributes.visibility !== 'public') {
        continue;
      }

      if (attributes.collaborators[input.userId]) {
        continue;
      }

      const updated = await updateNode({
        nodeId: space.id,
        userId: input.addedBy,
        workspaceId: input.workspaceId,
        updater: (attrs) => {
          if (attrs.type !== 'space' || attrs.visibility !== 'public') {
            return null;
          }

          if (attrs.collaborators[input.userId]) {
            return null;
          }

          return {
            ...attrs,
            collaborators: {
              ...attrs.collaborators,
              [input.userId]: role,
            },
          };
        },
      });

      if (!updated) {
        logger.warn(
          { spaceId: space.id, userId: input.userId },
          'Failed to add user to public space'
        );
      }
    }
  } catch (error) {
    logger.error(
      { error, workspaceId: input.workspaceId, userId: input.userId },
      'Failed to add user to public spaces'
    );
  }
};
