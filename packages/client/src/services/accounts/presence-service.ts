import { eventBus } from '@colanode/client/lib/event-bus';
import { AccountService } from '@colanode/client/services/accounts/account-service';
import {
  createDebugger,
  Message,
  PresenceLeaveMessage,
  PresenceState,
} from '@colanode/core';

const debug = createDebugger('desktop:service:presence');

// Drop a remote presence we have not heard from in this long (safety net for a
// leave that never arrived, e.g. a network blip). Clients re-broadcast their
// presence on a shorter heartbeat so idle viewers stay visible.
const PRESENCE_TTL = 30_000;
const SWEEP_INTERVAL = 10_000;

type RemotePresence = {
  presence: PresenceState;
  receivedAt: number;
};

/**
 * Per-account store of ephemeral presence (live cursors / pointers).
 *
 * Publishes the local user's presence over the account websocket and keeps an
 * in-memory map of remote presences per node. Nothing is persisted. Whenever a
 * node's presence set changes a `presence.changed` client event is emitted so
 * the UI (via the `presence.list` live query) re-renders.
 */
export class PresenceService {
  private readonly account: AccountService;
  private readonly eventSubscriptionId: string;
  private readonly sweepInterval: ReturnType<typeof setInterval>;

  // nodeId -> (`${userId}:${deviceId}` -> RemotePresence)
  private readonly remote = new Map<string, Map<string, RemotePresence>>();

  constructor(account: AccountService) {
    this.account = account;

    this.eventSubscriptionId = eventBus.subscribe((event) => {
      if (
        event.type === 'account.connection.message.received' &&
        event.accountId === this.account.id
      ) {
        this.handleMessage(event.message);
      } else if (
        event.type === 'account.connection.closed' &&
        event.accountId === this.account.id
      ) {
        this.clearAll();
      }
    });

    this.sweepInterval = setInterval(() => this.sweep(), SWEEP_INTERVAL);
  }

  private handleMessage(message: Message): void {
    if (message.type === 'presence.update') {
      this.applyRemote(message.presence);
    } else if (message.type === 'presence.leave') {
      this.removeRemote(message);
    }
  }

  private key(userId: string, deviceId: string): string {
    return `${userId}:${deviceId}`;
  }

  private applyRemote(presence: PresenceState): void {
    let byKey = this.remote.get(presence.nodeId);
    if (!byKey) {
      byKey = new Map();
      this.remote.set(presence.nodeId, byKey);
    }

    byKey.set(this.key(presence.userId, presence.deviceId), {
      presence,
      receivedAt: Date.now(),
    });

    this.emitChanged(presence.nodeId);
  }

  private removeRemote(message: PresenceLeaveMessage): void {
    const byKey = this.remote.get(message.nodeId);
    if (!byKey) {
      return;
    }

    const existed = byKey.delete(this.key(message.userId, message.deviceId));
    if (byKey.size === 0) {
      this.remote.delete(message.nodeId);
    }

    if (existed) {
      this.emitChanged(message.nodeId);
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [nodeId, byKey] of this.remote) {
      let changed = false;
      for (const [key, value] of byKey) {
        if (now - value.receivedAt > PRESENCE_TTL) {
          byKey.delete(key);
          changed = true;
        }
      }
      if (byKey.size === 0) {
        this.remote.delete(nodeId);
      }
      if (changed) {
        this.emitChanged(nodeId);
      }
    }
  }

  private clearAll(): void {
    const nodeIds = Array.from(this.remote.keys());
    this.remote.clear();
    for (const nodeId of nodeIds) {
      this.emitChanged(nodeId);
    }
  }

  private emitChanged(nodeId: string): void {
    eventBus.publish({
      type: 'presence.changed',
      accountId: this.account.id,
      nodeId,
      presences: this.getPresences(nodeId),
    });
  }

  /** Remote presences currently known for a node (excludes the local user). */
  public getPresences(nodeId: string): PresenceState[] {
    const byKey = this.remote.get(nodeId);
    if (!byKey) {
      return [];
    }
    return Array.from(byKey.values()).map((value) => value.presence);
  }

  /** Publish the local user's presence for a node. Best-effort. */
  public publish(presence: PresenceState): void {
    const sent = this.account.socket.send({
      type: 'presence.update',
      presence,
    });
    if (!sent) {
      debug(`Presence not sent (socket unavailable) for node ${presence.nodeId}`);
    }
  }

  /** Announce that the local user stopped presenting on a node. */
  public leave(message: Omit<PresenceLeaveMessage, 'type'>): void {
    this.account.socket.send({
      type: 'presence.leave',
      ...message,
    });
  }

  public destroy(): void {
    clearInterval(this.sweepInterval);
    eventBus.unsubscribe(this.eventSubscriptionId);
    this.remote.clear();
  }
}
