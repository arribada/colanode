import apn from '@parse/node-apn';

import { database } from '@colanode/server/data/database';
import { SelectApnsSubscription } from '@colanode/server/data/schema';
import { config } from '@colanode/server/lib/config';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('apns-sender');

let provider: apn.Provider | null = null;

export type ApnsPayload = {
  title: string;
  body: string;
  rootId: string;
  nodeId: string;
  workspaceId: string;
  url: string;
};

const ensureProvider = (): apn.Provider | null => {
  if (!config.apns.enabled) return null;
  if (!provider) {
    provider = new apn.Provider({
      token: {
        key: config.apns.key,
        keyId: config.apns.keyId,
        teamId: config.apns.teamId,
      },
      production: config.apns.production ?? true,
    });
  }
  return provider;
};

export const sendApns = async (
  subscription: Pick<SelectApnsSubscription, 'id' | 'device_token'>,
  payload: ApnsPayload
): Promise<void> => {
  const apnProvider = ensureProvider();
  if (!apnProvider || !config.apns.enabled) return;

  const notification = new apn.Notification();
  notification.alert = { title: payload.title, body: payload.body };
  notification.topic = config.apns.bundleId;
  notification.sound = 'default';
  notification.payload = {
    url: payload.url,
    rootId: payload.rootId,
    nodeId: payload.nodeId,
    workspaceId: payload.workspaceId,
  };

  try {
    const result = await apnProvider.send(
      notification,
      subscription.device_token
    );
    const failure = result.failed[0];
    if (!failure) return;

    const reason = failure.response?.reason;
    if (
      reason === 'Unregistered' ||
      reason === 'BadDeviceToken' ||
      failure.status === 410
    ) {
      await database
        .deleteFrom('apns_subscriptions')
        .where('id', '=', subscription.id)
        .execute();
      logger.info(`Pruned dead apns subscription ${subscription.id}`);
      return;
    }

    logger.error(failure.response, `Failed to send apns to ${subscription.id}`);
  } catch (error: unknown) {
    logger.error(error, `Failed to send apns to ${subscription.id}`);
  }
};
