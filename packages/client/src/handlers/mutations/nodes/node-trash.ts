import { set } from 'lodash-es';

import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import { fetchNode } from '@colanode/client/lib/utils';
import {
  MutationError,
  MutationErrorCode,
} from '@colanode/client/mutations';
import {
  NodeTrashMutationInput,
  NodeTrashMutationOutput,
} from '@colanode/client/mutations/nodes/node-trash';
import { isSoftDeletableNodeType } from '@colanode/core';

// Soft delete: sets deletedAt/deletedBy attributes via a normal node update,
// so the change syncs like any other edit and can be reverted with
// node.restore. Hard delete stays available as node.delete ("Delete forever").
export class NodeTrashMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<NodeTrashMutationInput>
{
  async handleMutation(
    input: NodeTrashMutationInput
  ): Promise<NodeTrashMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const node = await fetchNode(workspace.database, input.nodeId);
    if (!node) {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The node you are trying to move to trash does not exist.'
      );
    }

    if (!isSoftDeletableNodeType(node.type)) {
      throw new MutationError(
        MutationErrorCode.Unknown,
        `Nodes of type ${node.type} cannot be moved to trash.`
      );
    }

    const result = await workspace.nodes.updateNode(
      input.nodeId,
      (attributes) => {
        set(attributes, 'deletedAt', new Date().toISOString());
        set(attributes, 'deletedBy', workspace.userId);
        return attributes;
      }
    );

    if (result === 'unauthorized') {
      throw new MutationError(
        MutationErrorCode.Unknown,
        "You don't have permission to move this node to trash."
      );
    }

    if (result !== 'success') {
      throw new MutationError(
        MutationErrorCode.Unknown,
        'Something went wrong while moving the node to trash.'
      );
    }

    return {
      success: true,
    };
  }
}
