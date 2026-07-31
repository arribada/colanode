import { database } from '@colanode/server/data/database';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('dashboard-notifier');

// Mirrors the notification `type` union in lib/notifications.ts. Kept standalone
// rather than imported, for the same reason the Zulip notifier does: that file is
// the one that imports and calls into this one.
export type DashboardNotificationType =
  | 'mention'
  | 'direct_message'
  | 'task_assigned'
  | 'task_status';

export type DashboardNotificationContext = {
  userId: string;
  workspaceId: string;
  rootId: string;
  type: DashboardNotificationType;
  sourceNodeId: string;
  actorId: string | null;
};

const ACTION_LABELS: Record<DashboardNotificationType, string> = {
  mention: 'mentioned you',
  direct_message: 'sent you a message',
  task_assigned: 'assigned you a task',
  task_status: 'updated a task status',
};

const TIMEOUT_MS = 10_000;

export const isEnabled = (): boolean =>
  Boolean(process.env.ARRIBADA_NOTIFY_URL && process.env.ARRIBADA_NOTIFY_SECRET);

/**
 * Relay a wiki notification to the dashboard, which is the one place that knows a
 * wiki account, a Plane account and a dashboard account are the same person — it is
 * the SSO provider for all three. The join is the email address, so neither side has
 * to learn the other's user ids.
 *
 * Fire-and-forget, exactly like the Zulip hook next to it: a dashboard that is down
 * must never delay or fail the notification the wiki has already stored. The
 * notification id is sent along, and the dashboard drops anything it already holds,
 * so a retry costs nothing.
 */
export const notifyDashboard = (
  context: DashboardNotificationContext & { notificationId: string }
): void => {
  if (!isEnabled()) {
    return;
  }

  void (async () => {
    try {
      const [user, actor, source] = await Promise.all([
        database
          .selectFrom('users')
          .select(['email'])
          .where('id', '=', context.userId)
          .executeTakeFirst(),
        context.actorId
          ? database
              .selectFrom('users')
              .select(['name', 'custom_name'])
              .where('id', '=', context.actorId)
              .executeTakeFirst()
          : Promise.resolve(undefined),
        database
          .selectFrom('nodes')
          .select(['attributes'])
          .where('id', '=', context.sourceNodeId)
          .executeTakeFirst(),
      ]);

      if (!user?.email) {
        return;
      }

      const who = actor?.custom_name || actor?.name || 'Someone';
      const attributes = source?.attributes as { name?: string } | undefined;
      const where = attributes?.name ? ` in ${attributes.name}` : '';

      const appUrl = (process.env.WEB_URL || 'https://docs.arribada.org').replace(/\/$/, '');
      const response = await fetch(process.env.ARRIBADA_NOTIFY_URL as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Notify-Secret': process.env.ARRIBADA_NOTIFY_SECRET as string,
        },
        body: JSON.stringify({
          items: [
            {
              source: 'wiki',
              email: user.email,
              title: `${who} ${ACTION_LABELS[context.type]}`,
              message: `On the wiki${where}.`,
              url: `${appUrl}/${context.workspaceId}/${context.sourceNodeId}`,
              external_id: context.notificationId,
              kind: context.type,
            },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        logger.warn(`dashboard rejected the notification: ${response.status}`);
      }
    } catch (error) {
      // Swallowed on purpose: the wiki's own notification is already stored, and the
      // dashboard copy is a convenience.
      logger.warn(`dashboard relay failed: ${String(error)}`);
    }
  })();
};
