import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  ApnsSubscriptionDeleteMutationInput,
  ApnsSubscriptionDeleteMutationOutput,
} from '@colanode/client/mutations/apns-subscriptions/apns-subscription-delete';
import {
  generateId,
  IdType,
  ApnsSubscriptionDeleteMutation,
} from '@colanode/core';

export class ApnsSubscriptionDeleteMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<ApnsSubscriptionDeleteMutationInput>
{
  async handleMutation(
    input: ApnsSubscriptionDeleteMutationInput
  ): Promise<ApnsSubscriptionDeleteMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const now = new Date().toISOString();
    await workspace.database.transaction().execute(async (trx) => {
      const mutation: ApnsSubscriptionDeleteMutation = {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'apnsSubscription.delete',
        data: {
          deviceToken: input.deviceToken,
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
