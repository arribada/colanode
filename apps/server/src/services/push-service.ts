import { extractBlockTexts, extractNodeName, NodeAttributes } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNode } from '@colanode/server/data/schema';
import { sendApns } from '@colanode/server/lib/apns/apns-sender';
import { config } from '@colanode/server/lib/config';
import { eventBus } from '@colanode/server/lib/event-bus';
import { createLogger } from '@colanode/server/lib/logger';
import { mapNode } from '@colanode/server/lib/nodes';
import { sendWebPush } from '@colanode/server/lib/push/web-push-sender';
import { Event } from '@colanode/server/types/events';

const logger = createLogger('push-service');

const PREVIEW_MAX = 120;

class PushService {
  private subscriptionId: string | null = null;

  public async init(): Promise<void> {
    if (!config.push.enabled && !config.apns.enabled) return;
    if (this.subscriptionId !== null) return;
    this.subscriptionId = eventBus.subscribe((event) => {
      void this.handleEvent(event).catch((e) =>
        logger.error(e, 'push handler failed')
      );
    });
  }

  private async handleEvent(event: Event): Promise<void> {
    // Push on new messages AND edits (node.updated). Reactions live in a separate table, so a node.updated on a message node is a genuine content edit. Deletes are intentionally NOT handled (stale push left in place, Telegram-style).
    if (event.type !== 'node.created' && event.type !== 'node.updated') return;

    const nodeRow = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', event.nodeId)
      .executeTakeFirst();
    if (!nodeRow) return;

    const node = mapNode(nodeRow);
    if (node.type !== 'message') return;

    const rootRow = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', event.rootId)
      .executeTakeFirst();
    if (!rootRow) return;

    // A message's DB root is the top-level container of its whole tree — the
    // owning space for anything posted in a channel, or the chat itself for a
    // DM (chats have no parent, so they are their own root). Collaborations
    // (recipient access) are keyed by that root. The conversation a push is
    // actually about is one level narrower — the specific channel or chat the
    // message lives in — so it's resolved separately below and used for the
    // per-channel mute check, the title and the deep-link.
    const container = await this.resolveContainer(rootRow, nodeRow);
    if (!container) return;

    const actorId = nodeRow.created_by;

    // Recipients: collaborators of the root, minus author, minus muted.
    const collaborations = await database
      .selectFrom('collaborations')
      .select(['collaborator_id'])
      .where('node_id', '=', event.rootId)
      .where('deleted_at', 'is', null)
      .execute();

    const recipientUserIds = collaborations
      .map((c) => c.collaborator_id)
      .filter((id) => id !== actorId);
    if (recipientUserIds.length === 0) return;

    const muted = await database
      .selectFrom('notification_mutes')
      .select(['user_id'])
      .where('node_id', '=', container.id)
      .where('muted', '=', true)
      .where('user_id', 'in', recipientUserIds)
      .execute();
    const mutedSet = new Set(muted.map((m) => m.user_id));

    const finalUserIds = recipientUserIds.filter((id) => !mutedSet.has(id));
    if (finalUserIds.length === 0) return;

    // Map users -> accounts.
    const users = await database
      .selectFrom('users')
      .select(['id', 'account_id'])
      .where('id', 'in', finalUserIds)
      .execute();
    const accountIds = [...new Set(users.map((u) => u.account_id))];
    if (accountIds.length === 0) return;

    const [pushSubscriptions, apnsSubscriptions] = await Promise.all([
      database
        .selectFrom('push_subscriptions')
        .selectAll()
        .where('account_id', 'in', accountIds)
        .execute(),
      database
        .selectFrom('apns_subscriptions')
        .selectAll()
        .where('account_id', 'in', accountIds)
        .execute(),
    ]);
    if (pushSubscriptions.length === 0 && apnsSubscriptions.length === 0) {
      return;
    }

    // Chats have no name of their own — the push title falls back to the
    // author's display name (channels keep using the channel name).
    const authorRow = await database
      .selectFrom('users')
      .select(['name', 'custom_name'])
      .where('id', '=', actorId)
      .executeTakeFirst();
    const authorName = authorRow
      ? (authorRow.custom_name ?? authorRow.name)
      : null;

    const attributes = nodeRow.attributes as NodeAttributes;
    const basePayload = {
      title: this.containerTitle(container, authorName),
      body: this.preview(node.id, attributes),
      rootId: container.id,
      nodeId: node.id,
      workspaceId: event.workspaceId,
    };

    // Web routes are keyed by the recipient's in-workspace user id
    // (/workspace/$userId/$nodeId), so the deep-link differs per account.
    const userIdByAccount = new Map(users.map((u) => [u.account_id, u.id]));

    const startedAt = Date.now();
    // shortcut: inline fan-out, fine for team-scale deploys — the warn below names the ceiling; move to a BullMQ job if a channel grows to hundreds of members.
    await Promise.all([
      ...pushSubscriptions.map((sub) => {
        const recipientUserId = userIdByAccount.get(sub.account_id);
        if (!recipientUserId) return Promise.resolve();
        return sendWebPush(sub, {
          ...basePayload,
          url: `/workspace/${recipientUserId}/${container.id}`,
        }).catch((e) => logger.error(e, `push send failed for ${sub.id}`));
      }),
      ...apnsSubscriptions.map((sub) => {
        const recipientUserId = userIdByAccount.get(sub.account_id);
        if (!recipientUserId) return Promise.resolve();
        return sendApns(sub, {
          ...basePayload,
          url: `/workspace/${recipientUserId}/${container.id}`,
        }).catch((e) => logger.error(e, `apns send failed for ${sub.id}`));
      }),
    ]);
    const durationMs = Date.now() - startedAt;
    const subscriptionCount = pushSubscriptions.length + apnsSubscriptions.length;

    logger.info(
      {
        rootId: container.id,
        recipientCount: finalUserIds.length,
        subscriptionCount,
        durationMs,
      },
      'push fan-out'
    );

    if (subscriptionCount > 200 || durationMs > 2000) {
      logger.warn(
        {
          rootId: container.id,
          subscriptionCount,
          durationMs,
        },
        'push fan-out large — consider moving to a BullMQ job'
      );
    }
  }

  // Resolves the channel/chat a message belongs to. A chat has no parent and
  // is its own root, so it's the container directly. A message under a space
  // is parented by a channel — or, for a thread reply, by another top-level
  // message whose own parent is the channel (thread replies are always one
  // level deep, see ThreadPanelContent).
  private async resolveContainer(
    rootRow: SelectNode,
    nodeRow: SelectNode
  ): Promise<SelectNode | null> {
    if (rootRow.type === 'chat') return rootRow;
    if (rootRow.type !== 'space') return null;

    const parentId = nodeRow.parent_id;
    if (!parentId) return null;

    const parentRow = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', parentId)
      .executeTakeFirst();
    if (!parentRow) return null;
    if (parentRow.type === 'channel') return parentRow;

    if (parentRow.type === 'message') {
      const grandParentId = parentRow.parent_id;
      if (!grandParentId) return null;

      const grandParentRow = await database
        .selectFrom('nodes')
        .selectAll()
        .where('id', '=', grandParentId)
        .executeTakeFirst();
      if (grandParentRow && grandParentRow.type === 'channel') {
        return grandParentRow;
      }
    }

    return null;
  }

  private containerTitle(
    container: SelectNode,
    authorName: string | null
  ): string {
    if (container.type === 'chat') {
      return authorName && authorName.length > 0 ? authorName : 'New message';
    }

    const name = extractNodeName(container.attributes as NodeAttributes);
    return name && name.length > 0 ? name : 'New message';
  }

  private preview(nodeId: string, attributes: NodeAttributes): string {
    const text =
      attributes.type === 'message'
        ? extractBlockTexts(nodeId, attributes.content)
        : null;
    const body = text && text.length > 0 ? text : 'New message';
    return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX) + '…' : body;
  }
}

export const pushService = new PushService();
