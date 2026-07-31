import {
  MutationStatus,
  ApnsSubscriptionCreateMutation,
  ApnsSubscriptionDeleteMutation,
  generateId,
  IdType,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { WorkspaceContext } from '@colanode/server/types/api';

const isValidDeviceToken = (deviceToken: string): boolean => {
  return /^[0-9a-fA-F]+$/.test(deviceToken);
};

// shortcut: apns subscriptions are one-per-device-install, mirroring push
// subscriptions. `account_id`/`device_id` are immutable per row (see
// schema.ts), so a different account subscribing with the same device token
// replaces the row outright rather than updating it in place — this takes
// over that install's push channel, which is expected, not a bug.
export const createApnsSubscription = async (
  workspace: WorkspaceContext,
  mutation: ApnsSubscriptionCreateMutation
): Promise<MutationStatus> => {
  if (!isValidDeviceToken(mutation.data.deviceToken)) {
    return MutationStatus.BAD_REQUEST;
  }

  await database.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('apns_subscriptions')
      .where('device_token', '=', mutation.data.deviceToken)
      .execute();

    await trx
      .insertInto('apns_subscriptions')
      .values({
        id: generateId(IdType.Device),
        account_id: workspace.user.accountId,
        device_id: mutation.data.deviceId,
        device_token: mutation.data.deviceToken,
        created_at: new Date(mutation.data.createdAt),
      })
      .execute();
  });

  return MutationStatus.OK;
};

export const deleteApnsSubscription = async (
  workspace: WorkspaceContext,
  mutation: ApnsSubscriptionDeleteMutation
): Promise<MutationStatus> => {
  await database
    .deleteFrom('apns_subscriptions')
    .where('account_id', '=', workspace.user.accountId)
    .where('device_token', '=', mutation.data.deviceToken)
    .execute();

  return MutationStatus.OK;
};
