import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  PushSubscriptionCreateMutationInput,
  PushSubscriptionCreateMutationOutput,
} from '@colanode/client/mutations/push-subscriptions/push-subscription-create';
import {
  generateId,
  IdType,
  PushSubscriptionCreateMutation,
} from '@colanode/core';

export class PushSubscriptionCreateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<PushSubscriptionCreateMutationInput>
{
  async handleMutation(
    input: PushSubscriptionCreateMutationInput
  ): Promise<PushSubscriptionCreateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const now = new Date().toISOString();
    await workspace.database.transaction().execute(async (trx) => {
      const mutation: PushSubscriptionCreateMutation = {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'pushSubscription.create',
        data: {
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          deviceId: workspace.account.deviceId,
          createdAt: now,
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
