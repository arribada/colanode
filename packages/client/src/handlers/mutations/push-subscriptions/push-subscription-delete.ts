import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  PushSubscriptionDeleteMutationInput,
  PushSubscriptionDeleteMutationOutput,
} from '@colanode/client/mutations/push-subscriptions/push-subscription-delete';
import {
  generateId,
  IdType,
  PushSubscriptionDeleteMutation,
} from '@colanode/core';

export class PushSubscriptionDeleteMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<PushSubscriptionDeleteMutationInput>
{
  async handleMutation(
    input: PushSubscriptionDeleteMutationInput
  ): Promise<PushSubscriptionDeleteMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const now = new Date().toISOString();
    await workspace.database.transaction().execute(async (trx) => {
      const mutation: PushSubscriptionDeleteMutation = {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'pushSubscription.delete',
        data: {
          endpoint: input.endpoint,
        },
      };
      await trx
        .insertInto('mutations')
        .values({
          id: mutation.id,
          type: mutation.type,
          data: JSON.stringify(mutation.data),
          created_at: mutation.createdAt,
          retries: 0,
        })
        .execute();
    });
    workspace.mutations.scheduleSync();
    return { success: true };
  }
}
