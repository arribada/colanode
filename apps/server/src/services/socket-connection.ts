import { WebSocket } from 'ws';

import {
  Message,
  PresenceLeaveMessage,
  PresenceUpdateMessage,
  SynchronizerInput,
  SynchronizerInputMessage,
  UserStatus,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { createLogger } from '@colanode/server/lib/logger';
import { BaseSynchronizer } from '@colanode/server/synchronizers/base';
import { CollaborationSynchronizer } from '@colanode/server/synchronizers/collaborations';
import { DocumentUpdateSynchronizer } from '@colanode/server/synchronizers/document-updates';
import { NodeInteractionSynchronizer } from '@colanode/server/synchronizers/node-interactions';
import { NodeReactionSynchronizer } from '@colanode/server/synchronizers/node-reactions';
import { NodeTombstoneSynchronizer } from '@colanode/server/synchronizers/node-tombstones';
import { NodeUpdatesSynchronizer } from '@colanode/server/synchronizers/node-updates';
import { NotificationMuteSynchronizer } from '@colanode/server/synchronizers/notification-mutes';
import { NotificationSynchronizer } from '@colanode/server/synchronizers/notifications';
import { UserSynchronizer } from '@colanode/server/synchronizers/users';
import {
  AccountUpdatedEvent,
  CollaborationCreatedEvent,
  CollaborationUpdatedEvent,
  Event,
  UserCreatedEvent,
  UserUpdatedEvent,
  WorkspaceDeletedEvent,
  WorkspaceUpdatedEvent,
} from '@colanode/server/types/events';
import { SocketContext } from '@colanode/server/types/sockets';
import { ConnectedUser } from '@colanode/server/types/users';

type SocketUser = {
  user: ConnectedUser;
  rootIds: Set<string>;
  synchronizers: Map<string, BaseSynchronizer<SynchronizerInput>>;
};

// Ephemeral presence relayed from this connection to sibling connections.
// Tracked so that, when the socket drops, we can broadcast a matching leave.
type PublishedPresence = {
  userId: string;
  workspaceId: string;
  rootId: string;
  nodeId: string;
  kind: PresenceUpdateMessage['presence']['kind'];
};

type PresenceRelayMessage = PresenceUpdateMessage | PresenceLeaveMessage;

/**
 * A connection should receive a presence message only when at least one of its
 * authenticated users is a collaborator of the presence's root. This is the
 * same authorization used for node/document synchronizers, applied to the
 * ephemeral relay. Exported so the authorization can be unit-tested without a
 * live socket or database.
 */
export const canRelayPresenceToConnection = (
  users: Iterable<{ rootIds: Set<string> }>,
  rootId: string
): boolean => {
  for (const user of users) {
    if (user.rootIds.has(rootId)) {
      return true;
    }
  }
  return false;
};

export type PresenceBroadcaster = (
  originDeviceId: string,
  message: PresenceRelayMessage
) => void;

const logger = createLogger('server:service:socket-connection');

export class SocketConnection {
  private readonly context: SocketContext;
  private readonly socket: WebSocket;

  private readonly users: Map<string, SocketUser> = new Map();
  private readonly pendingUsers: Map<string, Promise<SocketUser | null>> =
    new Map();

  // Presence this connection has announced, keyed by `${userId}:${nodeId}:${kind}`,
  // so a leave can be broadcast for each when the socket closes.
  private readonly publishedPresence: Map<string, PublishedPresence> =
    new Map();
  private readonly broadcastPresence: PresenceBroadcaster;

  constructor(
    context: SocketContext,
    socket: WebSocket,
    onClose: () => void,
    broadcastPresence: PresenceBroadcaster = () => {}
  ) {
    logger.debug(context, 'New socket connection');

    this.context = context;
    this.socket = socket;
    this.broadcastPresence = broadcastPresence;

    this.socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as Message;
      this.handleMessage(message);
    });

    this.socket.on('close', () => {
      logger.debug(this.context, 'Socket connection closed');

      this.broadcastPresenceLeaveOnClose();
      onClose();
    });
  }

  public getDeviceId() {
    return this.context.deviceId;
  }

  public getAccountId() {
    return this.context.accountId;
  }

  public sendMessage(message: Message) {
    this.socket.send(JSON.stringify(message));
  }

  public close() {
    this.socket.close();
  }

  private async handleMessage(message: Message) {
    logger.debug(
      {
        context: this.context,
        message,
      },
      `New socket message`
    );

    if (message.type === 'synchronizer.input') {
      this.handleSynchronizerInput(message);
    } else if (message.type === 'presence.update') {
      this.handlePresenceUpdate(message);
    } else if (message.type === 'presence.leave') {
      this.handlePresenceLeave(message);
    }
  }

  /**
   * A client published its ephemeral presence. Authorize it (the user must be a
   * collaborator of the presence's root), stamp the authoritative device id and
   * relay it to every other connection that shares the root. Never persisted.
   */
  private async handlePresenceUpdate(message: PresenceUpdateMessage) {
    const presence = message.presence;
    const user = await this.getOrCreateUser(presence.userId);
    if (user === null) {
      return;
    }

    // The publisher can only announce presence in a root they collaborate on.
    if (!user.rootIds.has(presence.rootId)) {
      return;
    }

    // Authoritative device id (prevents a client from spoofing another device).
    const relayed: PresenceUpdateMessage = {
      type: 'presence.update',
      presence: {
        ...presence,
        deviceId: this.context.deviceId,
      },
    };

    const key = `${presence.userId}:${presence.nodeId}:${presence.kind}`;
    this.publishedPresence.set(key, {
      userId: presence.userId,
      workspaceId: presence.workspaceId,
      rootId: presence.rootId,
      nodeId: presence.nodeId,
      kind: presence.kind,
    });

    this.broadcastPresence(this.context.deviceId, relayed);
  }

  private async handlePresenceLeave(message: PresenceLeaveMessage) {
    const user = await this.getOrCreateUser(message.userId);
    if (user === null) {
      return;
    }

    if (!user.rootIds.has(message.rootId)) {
      return;
    }

    const relayed: PresenceLeaveMessage = {
      ...message,
      deviceId: this.context.deviceId,
    };

    const key = `${message.userId}:${message.nodeId}:${message.kind}`;
    this.publishedPresence.delete(key);

    this.broadcastPresence(this.context.deviceId, relayed);
  }

  /**
   * Deliver a relayed presence message to this connection's socket when one of
   * its users is authorized for the presence's root. Called by the socket
   * service for every connection except the origin.
   */
  public relayPresence(message: PresenceRelayMessage) {
    const rootId =
      message.type === 'presence.update'
        ? message.presence.rootId
        : message.rootId;

    if (!canRelayPresenceToConnection(this.users.values(), rootId)) {
      return;
    }

    this.sendMessage(message);
  }

  private broadcastPresenceLeaveOnClose() {
    for (const presence of this.publishedPresence.values()) {
      this.broadcastPresence(this.context.deviceId, {
        type: 'presence.leave',
        userId: presence.userId,
        deviceId: this.context.deviceId,
        workspaceId: presence.workspaceId,
        rootId: presence.rootId,
        nodeId: presence.nodeId,
        kind: presence.kind,
      });
    }
    this.publishedPresence.clear();
  }

  public async handleEvent(event: Event) {
    if (event.type === 'account.updated') {
      this.handleAccountUpdatedEvent(event);
    } else if (event.type === 'workspace.updated') {
      this.handleWorkspaceUpdatedEvent(event);
    } else if (event.type === 'workspace.deleted') {
      this.handleWorkspaceDeletedEvent(event);
    } else if (event.type === 'collaboration.created') {
      this.handleCollaborationCreatedEvent(event);
    } else if (event.type === 'collaboration.updated') {
      this.handleCollaborationUpdatedEvent(event);
    } else if (event.type === 'user.created') {
      this.handleUserCreatedEvent(event);
    } else if (event.type === 'user.updated') {
      this.handleUserUpdatedEvent(event);
    }

    for (const user of this.users.values()) {
      for (const synchronizer of user.synchronizers.values()) {
        const output = await synchronizer.fetchDataFromEvent(event);
        if (output) {
          user.synchronizers.delete(synchronizer.id);
          this.sendMessage(output);
        }
      }
    }
  }

  private async handleSynchronizerInput(message: SynchronizerInputMessage) {
    const user = await this.getOrCreateUser(message.userId);
    if (user === null) {
      return;
    }

    const synchronizer = this.buildSynchronizer(message, user);
    if (synchronizer === null) {
      return;
    }

    const output = await synchronizer.fetchData();
    if (output === null) {
      user.synchronizers.set(synchronizer.id, synchronizer);
      return;
    }

    this.sendMessage(output);
  }

  private buildSynchronizer(
    message: SynchronizerInputMessage,
    user: SocketUser
  ): BaseSynchronizer<SynchronizerInput> | null {
    const cursor = message.cursor;
    if (message.input.type === 'users') {
      return new UserSynchronizer(message.id, user.user, message.input, cursor);
    } else if (message.input.type === 'collaborations') {
      return new CollaborationSynchronizer(
        message.id,
        user.user,
        message.input,
        cursor
      );
    } else if (message.input.type === 'node.updates') {
      if (!user.rootIds.has(message.input.rootId)) {
        return null;
      }

      return new NodeUpdatesSynchronizer(
        message.id,
        user.user,
        message.input,
        cursor
      );
    } else if (message.input.type === 'node.reactions') {
      return new NodeReactionSynchronizer(
        message.id,
        user.user,
        message.input,
        cursor
      );
    } else if (message.input.type === 'node.interactions') {
      return new NodeInteractionSynchronizer(
        message.id,
        user.user,
        message.input,
        cursor
      );
    } else if (message.input.type === 'node.tombstones') {
      if (!user.rootIds.has(message.input.rootId)) {
        return null;
      }

      return new NodeTombstoneSynchronizer(
        message.id,
        user.user,
        message.input,
        cursor
      );
    } else if (message.input.type === 'document.updates') {
      if (!user.rootIds.has(message.input.rootId)) {
        return null;
      }

      return new DocumentUpdateSynchronizer(
        message.id,
        user.user,
        message.input,
        cursor
      );
    } else if (message.input.type === 'notifications') {
      return new NotificationSynchronizer(
        message.id,
        user.user,
        message.input,
        cursor
      );
    } else if (message.input.type === 'notification-mutes') {
      return new NotificationMuteSynchronizer(
        message.id,
        user.user,
        message.input,
        cursor
      );
    }

    return null;
  }

  private async getOrCreateUser(userId: string): Promise<SocketUser | null> {
    const existingUser = this.users.get(userId);
    if (existingUser) {
      return existingUser;
    }

    const pendingUser = this.pendingUsers.get(userId);
    if (pendingUser) {
      return pendingUser;
    }

    const userPromise = this.fetchAndCreateUser(userId);
    this.pendingUsers.set(userId, userPromise);

    try {
      const user = await userPromise;
      return user;
    } finally {
      this.pendingUsers.delete(userId);
    }
  }

  private async fetchAndCreateUser(userId: string): Promise<SocketUser | null> {
    const user = await database
      .selectFrom('users')
      .where('id', '=', userId)
      .where('status', '=', UserStatus.Active)
      .where('role', '!=', 'none')
      .selectAll()
      .executeTakeFirst();

    if (
      !user ||
      user.status !== UserStatus.Active ||
      user.account_id !== this.context.accountId
    ) {
      return null;
    }

    const collaborations = await database
      .selectFrom('collaborations')
      .selectAll()
      .where('collaborator_id', '=', userId)
      .execute();

    const addedSocketUser = this.users.get(userId);
    if (addedSocketUser) {
      return addedSocketUser;
    }

    // Create and store the new SocketUser
    const connectedUser: ConnectedUser = {
      userId: user.id,
      workspaceId: user.workspace_id,
      accountId: this.context.accountId,
      deviceId: this.context.deviceId,
    };

    const rootIds = new Set<string>();
    for (const collaboration of collaborations) {
      if (collaboration.deleted_at) {
        continue;
      }

      rootIds.add(collaboration.node_id);
    }

    const socketUser: SocketUser = {
      user: connectedUser,
      rootIds,
      synchronizers: new Map(),
    };

    this.users.set(userId, socketUser);
    return socketUser;
  }

  private handleAccountUpdatedEvent(event: AccountUpdatedEvent) {
    if (event.accountId !== this.context.accountId) {
      return;
    }

    this.sendMessage({
      type: 'account.updated',
      accountId: this.context.accountId,
    });
  }

  private handleWorkspaceUpdatedEvent(event: WorkspaceUpdatedEvent) {
    const socketUsers = Array.from(this.users.values()).filter(
      (user) => user.user.workspaceId === event.workspaceId
    );

    if (socketUsers.length === 0) {
      return;
    }

    this.sendMessage({
      type: 'workspace.updated',
      workspaceId: event.workspaceId,
    });
  }

  private handleWorkspaceDeletedEvent(event: WorkspaceDeletedEvent) {
    const socketUsers = Array.from(this.users.values()).filter(
      (user) => user.user.workspaceId === event.workspaceId
    );

    if (socketUsers.length === 0) {
      return;
    }

    this.sendMessage({
      type: 'workspace.deleted',
      accountId: this.context.accountId,
    });
  }

  private handleCollaborationCreatedEvent(event: CollaborationCreatedEvent) {
    const user = this.users.get(event.collaboratorId);
    if (!user) {
      return;
    }

    user.rootIds.add(event.nodeId);
  }

  private async handleCollaborationUpdatedEvent(
    event: CollaborationUpdatedEvent
  ) {
    const user = this.users.get(event.collaboratorId);
    if (!user) {
      return;
    }

    const collaboration = await database
      .selectFrom('collaborations')
      .selectAll()
      .where('collaborator_id', '=', event.collaboratorId)
      .where('node_id', '=', event.nodeId)
      .executeTakeFirst();

    if (!collaboration || collaboration.deleted_at) {
      user.rootIds.delete(event.nodeId);
    } else {
      user.rootIds.add(event.nodeId);
    }
  }

  private handleUserCreatedEvent(event: UserCreatedEvent) {
    if (event.accountId !== this.context.accountId) {
      return;
    }

    this.sendMessage({
      type: 'user.created',
      accountId: event.accountId,
      workspaceId: event.workspaceId,
      userId: event.userId,
    });
  }

  private handleUserUpdatedEvent(event: UserUpdatedEvent) {
    if (event.accountId !== this.context.accountId) {
      return;
    }

    this.sendMessage({
      type: 'user.updated',
      accountId: event.accountId,
      userId: event.userId,
    });
  }
}
