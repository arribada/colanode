import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  NodeDeleteMutationInput,
  NodeDeleteMutationOutput,
} from '@colanode/client/mutations/nodes/node-delete';

export class NodeDeleteMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<NodeDeleteMutationInput>
{
  async handleMutation(
    input: NodeDeleteMutationInput
  ): Promise<NodeDeleteMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    // A not_found result is intentional here: the node wasn't in the local
    // database (a stale ghost), and collections.nodes.delete already removed it
    // from the view optimistically -- THROWING would only roll that removal
    // back and strand the user with an undeletable item. deleteNode still
    // deletes and tombstones a node that IS present (including an orphan with a
    // broken ancestor chain), so a real node is removed and synced properly.
    await workspace.nodes.deleteNode(input.nodeId);

    return {
      success: true,
    };
  }
}
