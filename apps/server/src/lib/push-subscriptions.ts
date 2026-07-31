import {
  MutationStatus,
  PushSubscriptionCreateMutation,
  PushSubscriptionDeleteMutation,
  generateId,
  IdType,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { WorkspaceContext } from '@colanode/server/types/api';

const isPrivateIpv4 = (host: string): boolean => {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
};

// SSRF guard: the endpoint is user-supplied and the server later POSTs to it
// (webpush.sendNotification). Require https and a public hostname; a vendor
// allowlist would break the open Web Push spec (UnifiedPush, self-hosted
// relays), so only obviously-internal targets are rejected.
const isValidPushEndpoint = (endpoint: string): boolean => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') {
    return false;
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return false;
  }

  // IPv6 literals ([::1] etc.) — real push services use domain names.
  if (host.startsWith('[')) {
    return false;
  }

  return !isPrivateIpv4(host);
};

// shortcut: push subscriptions are one-per-browser-install by web-platform
// constraint (a service-worker registration holds exactly one push
// subscription). `account_id`/`device_id` are immutable per row (see
// schema.ts), so a different account subscribing with the same endpoint
// replaces the row outright rather than updating it in place — this takes
// over that install's push channel, which is expected, not a bug.
export const createPushSubscription = async (
  workspace: WorkspaceContext,
  mutation: PushSubscriptionCreateMutation
): Promise<MutationStatus> => {
  if (!isValidPushEndpoint(mutation.data.endpoint)) {
    return MutationStatus.BAD_REQUEST;
  }

  await database.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('push_subscriptions')
      .where('endpoint', '=', mutation.data.endpoint)
      .execute();

    await trx
      .insertInto('push_subscriptions')
      .values({
        id: generateId(IdType.Device),
        account_id: workspace.user.accountId,
        device_id: mutation.data.deviceId,
        endpoint: mutation.data.endpoint,
        p256dh: mutation.data.p256dh,
        auth: mutation.data.auth,
        created_at: new Date(mutation.data.createdAt),
      })
      .execute();
  });

  return MutationStatus.OK;
};

export const deletePushSubscription = async (
  workspace: WorkspaceContext,
  mutation: PushSubscriptionDeleteMutation
): Promise<MutationStatus> => {
  await database
    .deleteFrom('push_subscriptions')
    .where('account_id', '=', workspace.user.accountId)
    .where('endpoint', '=', mutation.data.endpoint)
    .execute();

  return MutationStatus.OK;
};
