import { set } from 'lodash-es';

import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import { fetchNodeTree } from '@colanode/client/lib/utils';
import {
  MutationError,
  MutationErrorCode,
} from '@colanode/client/mutations';
import {
  NodeRestoreMutationInput,
  NodeRestoreMutationOutput,
} from '@colanode/client/mutations/nodes/node-restore';
import { isNodeTrashed } from '@colanode/core';

// Restore from trash: clears deletedAt/deletedBy on the node and on any
// trashed ancestor, so the node becomes reachable again (a node restored
// inside a still-trashed folder would otherwise stay invisible).
export class NodeRestoreMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<NodeRestoreMutationInput>
{
  async handleMutation(
    input: NodeRestoreMutationInput
  ): Promise<NodeRestoreMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    const tree = await fetchNodeTree(workspace.database, input.nodeId);
    const node = tree[tree.length - 1];
    if (!node || node.id !== input.nodeId) {
      throw new MutationError(
        MutationErrorCode.NodeNotFound,
        'The node you are trying to restore does not exist.'
      );
    }

    const trashedIds = tree
      .filter((treeNode) => isNodeTrashed(treeNode))
      .map((treeNode) => treeNode.id);

    for (const trashedId of trashedIds) {
      const result = await workspace.nodes.updateNode(
        trashedId,
        (attributes) => {
          set(attributes, 'deletedAt', null);
          set(attributes, 'deletedBy', null);
          return attributes;
        }
      );

      if (result === 'unauthorized') {
        throw new MutationError(
          MutationErrorCode.Unknown,
          "You don't have permission to restore this node."
        );
      }

      if (result !== 'success') {
        throw new MutationError(
          MutationErrorCode.Unknown,
          'Something went wrong while restoring the node.'
        );
      }
    }

    return {
      success: true,
    };
  }
}
