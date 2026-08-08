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
    const result = await workspace.nodes.deleteNode(input.nodeId);

    if (result === 'not_found') {
      // Don't pretend it worked: the node isn't in the local database (e.g. a
      // stale display-only ghost). Tell the user so they can reload.
      throw new Error(
        'This item is no longer in your local data. Reload the page to refresh the view.'
      );
    }

    return {
      success: true,
    };
  }
}
