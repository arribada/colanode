import { extractBlockTexts, extractNodeName, NodeAttributes } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { createLogger } from '@colanode/server/lib/logger';
import { sendZulipMessage } from '@colanode/server/lib/zulip/zulip-client';

const logger = createLogger('zulip-notifier');

const SNIPPET_MAX = 160;
const TOPIC_MAX = 60;
const DEFAULT_TOPIC = 'Colanode';

// Mirrors the notification `type` union in lib/notifications.ts. Kept as a
// standalone type (rather than importing it) so this module has no
// dependency on lib/notifications.ts — that file is the one that imports
// and calls into this one.
export type ZulipNotificationType =
  | 'mention'
  | 'direct_message'
  | 'task_assigned'
  | 'task_status';

export type ZulipNotificationContext = {
  userId: string;
  workspaceId: string;
  rootId: string;
  type: ZulipNotificationType;
  sourceNodeId: string;
  actorId: string | null;
};

const ACTION_LABELS: Record<ZulipNotificationType, string> = {
  mention: 'mentioned you',
  direct_message: 'sent you a message',
  task_assigned: 'assigned you a task',
  task_status: 'updated a task status',
};

// Builds the Zulip message (topic + markdown content) for a notification.
// Exported on its own so it can be unit-tested without going through the
// network-calling sendZulipMessage.
export const buildZulipMessage = async (
  context: ZulipNotificationContext
): Promise<{ topic: string; content: string }> => {
  const [actorRow, rootRow, sourceRow] = await Promise.all([
    context.actorId
      ? database
          .selectFrom('users')
          .select(['name', 'custom_name'])
          .where('id', '=', context.actorId)
          .executeTakeFirst()
      : Promise.resolve(undefined),
    database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', context.rootId)
      .executeTakeFirst(),
    database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', context.sourceNodeId)
      .executeTakeFirst(),
  ]);

  const actorName =
    (actorRow && (actorRow.custom_name ?? actorRow.name)) || 'Someone';

  const rootAttributes = rootRow?.attributes as NodeAttributes | undefined;
  const rootTitle =
    (rootAttributes && extractNodeName(rootAttributes)) || DEFAULT_TOPIC;

  let snippet = '';
  if (sourceRow) {
    const sourceAttributes = sourceRow.attributes as NodeAttributes;
    if (sourceAttributes.type === 'message') {
      snippet = extractBlockTexts(sourceRow.id, sourceAttributes.content) ?? '';
    }
  }
  if (snippet.length > SNIPPET_MAX) {
    snippet = `${snippet.slice(0, SNIPPET_MAX)}…`;
  }

  const web = config.web;
  const link = web
    ? `${web.protocol}://${web.domain}/workspace/${context.userId}/${context.rootId}`
    : null;
  const rootLabel = link ? `[${rootTitle}](${link})` : rootTitle;

  const action = ACTION_LABELS[context.type];
  const lines = [`**${actorName}** ${action} in ${rootLabel}`];
  if (snippet) {
    lines.push(`> ${snippet}`);
  }

  return {
    topic: rootTitle.slice(0, TOPIC_MAX) || DEFAULT_TOPIC,
    content: lines.join('\n'),
  };
};

// Fire-and-forget hook called from lib/notifications.ts every time a
// notification row is created (mention, chat message/"direct_message",
// task_assigned, task_status). No-ops immediately when the integration is
// disabled, so the DB lookups in buildZulipMessage are never done unless
// Zulip notifications are actually turned on.
export const notifyZulip = (context: ZulipNotificationContext): void => {
  if (!config.zulip.enabled) {
    return;
  }

  void buildZulipMessage(context)
    .then((message) => sendZulipMessage(message))
    .catch((error) => logger.error(error, 'Zulip notify failed'));
};
