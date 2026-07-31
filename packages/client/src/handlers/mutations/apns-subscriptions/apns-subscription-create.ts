import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  ApnsSubscriptionCreateMutationInput,
  ApnsSubscriptionCreateMutationOutput,
} from '@colanode/client/mutations/apns-subscriptions/apns-subscription-create';
import {
  generateId,
  IdType,
  ApnsSubscriptionCreateMutation,
} from '@colanode/core';

export class ApnsSubscriptionCreateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<ApnsSubscriptionCreateMutationInput>
{
  async handleMutation(
    input: ApnsSubscriptionCreateMutationInput
  ): Promise<ApnsSubscriptionCreateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const now = new Date().toISOString();
    await workspace.database.transaction().execute(async (trx) => {
      const mutation: ApnsSubscriptionCreateMutation = {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'apnsSubscription.create',
        data: {
          deviceToken: input.deviceToken,
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
