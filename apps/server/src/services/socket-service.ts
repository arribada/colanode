import { WebSocket } from 'ws';

import { generateId, IdType } from '@colanode/core';
import { redis } from '@colanode/server/data/redis';
import { eventBus } from '@colanode/server/lib/event-bus';
import {
  PresenceBroadcaster,
  SocketConnection,
} from '@colanode/server/services/socket-connection';
import { ClientContext, AccountContext } from '@colanode/server/types/api';
import { SocketContext } from '@colanode/server/types/sockets';

class SocketService {
  private readonly connections: Map<string, SocketConnection> = new Map();

  constructor() {
    eventBus.subscribe((event) => {
      if (event.type === 'device.deleted') {
        const connection = this.connections.get(event.deviceId);
        if (connection) {
          connection.close();
          this.connections.delete(event.deviceId);
        }

        return;
      }

      for (const connection of this.connections.values()) {
        connection.handleEvent(event);
      }
    });
  }

  public async initSocket(account: AccountContext, client: ClientContext) {
    const id = generateId(IdType.Socket);
    const context: SocketContext = {
      id,
      accountId: account.id,
      deviceId: account.deviceId,
      client,
    };

    await redis.set(id, JSON.stringify(context), {
      expiration: {
        type: 'EX',
        value: 60,
      },
    });

    return id;
  }

  public async addConnection(id: string, socket: WebSocket): Promise<boolean> {
    const context = await this.fetchSocketContext(id);
    if (!context) {
      return false;
    }

    const existingConnection = this.connections.get(context.deviceId);
    if (existingConnection) {
      existingConnection.close();
      this.connections.delete(context.deviceId);
    }

    const connection = new SocketConnection(
      context,
      socket,
      () => this.connections.delete(context.deviceId),
      this.broadcastPresence
    );
    this.connections.set(context.deviceId, connection);

    return true;
  }

  /**
   * Relay an ephemeral presence message to every connection except the origin
   * device. Each receiving connection re-checks authorization before delivering
   * to its socket.
   *
   * NOTE: this is an in-process relay. The current self-hosted deployment runs
   * the server in `standalone` mode (single instance), so all live collaborators
   * share this process. A multi-instance / `cluster` deployment would need this
   * fanned out over a Redis pub/sub channel (like the event bus) for presence to
   * cross hosts.
   */
  private readonly broadcastPresence: PresenceBroadcaster = (
    originDeviceId,
    message
  ) => {
    for (const [deviceId, connection] of this.connections) {
      if (deviceId === originDeviceId) {
        continue;
      }
      connection.relayPresence(message);
    }
  };

  private async fetchSocketContext(id: string): Promise<SocketContext | null> {
    const data = await redis.get(id);
    if (!data) {
      return null;
    }

    await redis.del(id);
    return JSON.parse(data);
  }
}

export const socketService = new SocketService();
