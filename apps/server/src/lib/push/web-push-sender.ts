import webpush from 'web-push';

import { database } from '@colanode/server/data/database';
import { SelectPushSubscription } from '@colanode/server/data/schema';
import { config } from '@colanode/server/lib/config';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('web-push-sender');

let configured = false;

export type WebPushPayload = {
  title: string;
  body: string;
  rootId: string;
  nodeId: string;
  workspaceId: string;
  url: string;
};

const ensureConfigured = (): boolean => {
  if (!config.push.enabled) return false;
  if (!configured) {
    webpush.setVapidDetails(
      config.push.subject,
      config.push.publicKey,
      config.push.privateKey
    );
    configured = true;
  }
  return true;
};

export const sendWebPush = async (
  subscription: Pick<
    SelectPushSubscription,
    'id' | 'endpoint' | 'p256dh' | 'auth'
  >,
  payload: WebPushPayload
): Promise<void> => {
  if (!ensureConfigured()) return;

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await database
        .deleteFrom('push_subscriptions')
        .where('id', '=', subscription.id)
        .execute();
      logger.info(`Pruned dead push subscription ${subscription.id}`);
      return;
    }
    logger.error(error, `Failed to send web push to ${subscription.id}`);
  }
};
