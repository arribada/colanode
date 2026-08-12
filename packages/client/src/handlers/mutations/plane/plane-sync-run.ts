import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  PlaneSyncRunMutationInput,
  PlaneSyncRunMutationOutput,
} from '@colanode/client/mutations/plane/plane-sync-run';

export class PlaneSyncRunMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<PlaneSyncRunMutationInput>
{
  public async handleMutation(
    input: PlaneSyncRunMutationInput
  ): Promise<PlaneSyncRunMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    // The server answers as soon as the run is accepted, not when it ends: a
    // full sweep is about a minute, and a button that holds the page that
    // long gets pressed again.
    return await workspace.account.client
      .post(`v1/workspaces/${workspace.workspaceId}/integrations/plane/sync`)
      .json<PlaneSyncRunMutationOutput>();
  }
}
