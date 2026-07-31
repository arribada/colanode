import { ChatNode, getNodeModel, NodeAttributes } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { createLogger } from '@colanode/server/lib/logger';
import { mapNode } from '@colanode/server/lib/nodes';
import {
  createMentionNotifications,
  createNotification,
} from '@colanode/server/lib/notifications';
import { Event } from '@colanode/server/types/events';

const logger = createLogger('notification-service');

class NotificationService {
  private subscriptionId: string | null = null;

  public async init(): Promise<void> {
    if (this.subscriptionId !== null) return;
    this.subscriptionId = eventBus.subscribe((event) => {
      void this.handleEvent(event).catch((e) =>
        logger.error(e, 'notification handler failed')
      );
    });
  }

  private async handleEvent(event: Event): Promise<void> {
    if (event.type !== 'node.created' && event.type !== 'node.updated') return;

    const nodeRow = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', event.nodeId)
      .executeTakeFirst();
    if (!nodeRow) return;

    const rootRow = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', event.rootId)
      .executeTakeFirst();
    if (!rootRow) return;

    const node = mapNode(nodeRow);
    const rootNode = mapNode(rootRow);
    const actorId = nodeRow.created_by;
    const attributes = nodeRow.attributes as NodeAttributes;

    // Mentions: extract mention targets from the node's content blocks.
    // Mention leaves carry `{ id: mentionId, target: userId | nodeId }`;
    // createMentionNotifications filters to user targets and checks roles.
    const model = getNodeModel(node.type);
    const mentions = model.extractMentions(node.id, attributes);

    await createMentionNotifications({
      mentions,
      workspaceId: event.workspaceId,
      rootId: event.rootId,
      rootNode,
      sourceNodeId: node.id,
      actorId,
    });

    // Direct messages: a new message in a chat root -> notify other chat members
    if (
      event.type === 'node.created' &&
      node.type === 'message' &&
      rootNode.type === 'chat'
    ) {
      const chatCollaborators = (rootNode as ChatNode).collaborators;
      for (const userId of Object.keys(chatCollaborators)) {
        if (userId === actorId) continue;
        await createNotification({
          userId,
          workspaceId: event.workspaceId,
          rootId: event.rootId,
          type: 'direct_message',
          sourceNodeId: node.id,
          actorId,
          preview: {},
        });
      }
    }
  }
}

export const notificationService = new NotificationService();
