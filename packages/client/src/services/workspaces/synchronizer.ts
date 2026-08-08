import { sha256 } from 'js-sha256';
import { computeHealCursor } from '@colanode/client/services/workspaces/sync-guards';
import ms from 'ms';

import { eventBus } from '@colanode/client/lib/event-bus';
import { EventLoop } from '@colanode/client/lib/event-loop';
import { AccountSocket } from '@colanode/client/services/accounts/account-socket';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import {
  SynchronizerOutputMessage,
  SynchronizerInputMessage,
  SynchronizerInput,
  SynchronizerMap,
  createDebugger,
  Message,
} from '@colanode/core';

export type SynchronizerStatus = 'idle' | 'waiting' | 'processing';

const debug = createDebugger('desktop:synchronizer');

// How many revisions the self-healing re-sync rewinds its cursor on each
// pass. `revision` is assigned at INSERT but rows commit out of order, so a
// writer that took a low revision yet committed late can land BELOW a cursor
// that already advanced past it -- `revision > cursor` then never returns it
// and the update is silently dropped from this client. Rewinding by a bounded
// window and re-pulling recovers it; every row re-pulled is re-applied
// idempotently, so this only needs to exceed the realistic number of
// concurrent commits during one slow transaction.
const HEAL_LOOKBACK = 200n;

export class Synchronizer<TInput extends SynchronizerInput> {
  private readonly id: string;
  private readonly input: TInput;
  private readonly workspace: WorkspaceService;
  private readonly connection: AccountSocket;
  private readonly cursorKey: string;
  private readonly eventLoop: EventLoop;
  private readonly eventSubscriptionId: string;

  private readonly processor: (
    data: SynchronizerMap[TInput['type']]['data']
  ) => Promise<void>;

  // Optional back-pressure gate. When provided and it returns false, this
  // synchronizer holds off sending its next pull to the server (it stays idle,
  // sends nothing) until the gate opens again. Used by SyncService to let the
  // currently-opened root ("space") back-fill first on a cold sync while the
  // other roots wait a short, bounded moment. When omitted (all the global
  // synchronizers -- users, collaborations, notifications, ...) the
  // synchronizer always pulls, exactly as before. This only reorders WHEN a
  // root pulls; it never drops data -- every root still pulls to completion.
  private readonly canPull?: () => boolean;

  private status: SynchronizerStatus = 'idle';
  private cursor: string = '0';
  private initialized: boolean = false;
  private readonly healable: boolean;
  private healLoop: EventLoop | null = null;
  private healing: boolean = false;

  constructor(
    workspace: WorkspaceService,
    input: TInput,
    cursorKey: string,
    processor: (data: SynchronizerMap[TInput['type']]['data']) => Promise<void>,
    canPull?: () => boolean,
    healable: boolean = false
  ) {
    this.workspace = workspace;
    this.connection = workspace.account.socket;
    this.input = input;
    this.cursorKey = cursorKey;
    this.id = this.generateId();
    this.processor = processor;
    this.canPull = canPull;
    this.healable = healable;

    this.eventLoop = new EventLoop(
      ms('1 minute'),
      ms('1 second'),
      this.ping.bind(this)
    );

    this.eventSubscriptionId = eventBus.subscribe((event) => {
      if (
        event.type === 'account.connection.message.received' &&
        event.accountId === this.workspace.account.id
      ) {
        this.handleMessage(event.message);
      } else if (
        event.type === 'account.connection.opened' &&
        event.accountId === this.workspace.account.id
      ) {
        this.eventLoop.trigger();
        this.healLoop?.trigger();
      } else if (
        event.type === 'account.connection.closed' &&
        event.accountId === this.workspace.account.id
      ) {
        this.eventLoop.stop();
      }
    });

    this.eventLoop.start();
  }

  public async init() {
    this.cursor = await this.fetchCursor();
    this.initConsumer();
    this.eventLoop.start();
    if (this.healable) {
      this.healLoop = new EventLoop(
        ms('3 minutes'),
        ms('10 seconds'),
        this.heal.bind(this)
      );
      this.healLoop.start();
    }
    this.initialized = true;
  }

  private ping() {
    if (!this.initialized) {
      return;
    }

    this.initConsumer();
  }

  private handleMessage(message: Message) {
    if (message.type === 'synchronizer.output' && message.id === this.id) {
      this.sync(message as SynchronizerOutputMessage<TInput>);
    }
  }

  private async sync(message: SynchronizerOutputMessage<TInput>) {
    if (message.id !== this.id) {
      return;
    }

    if (this.status === 'processing') {
      return;
    }

    this.status = 'processing';
    let lastCursor: string | null = null;
    let processedCount = 0;

    try {
      for (const item of message.items) {
        await this.processor(item.data);
        lastCursor = item.cursor;
        processedCount++;
      }
    } catch (error) {
      debug(`Error consuming items: ${error}`);
    } finally {
      if (lastCursor !== null) {
        this.cursor = lastCursor;
        await this.saveCursor(lastCursor);
      }

      // Best-effort progress signal for the UI's "Synchronisation..."
      // indicator -- fire only when something was actually applied so an
      // empty poll (caught up, nothing new) doesn't look like activity.
      const wasHealing = this.healing;
      this.healing = false;
      if (processedCount > 0 && !wasHealing) {
        eventBus.publish({
          type: 'workspace.sync.progress',
          workspace: {
            workspaceId: this.workspace.workspaceId,
            userId: this.workspace.userId,
            accountId: this.workspace.accountId,
          },
          itemCount: processedCount,
        });
      }

      this.status = 'idle';
      this.initConsumer();
    }
  }

  /**
   * Ask this synchronizer to (re)attempt a pull now. Used by SyncService to
   * promptly wake a synchronizer that had been held back by its `canPull` gate,
   * instead of waiting up to a minute for the next `ping`. Safe to call at any
   * time: if the synchronizer is mid-pull or the gate is still closed,
   * `initConsumer` is a no-op.
   */
  public pull() {
    this.initConsumer();
  }

  private initConsumer() {
    if (this.status === 'processing') {
      return;
    }

    if (!this.connection.isConnected()) {
      return;
    }

    // Priority back-pressure: a gated (non-priority) root defers its pull while
    // a higher-priority root is back-filling. It stays 'idle' (no message sent),
    // so a later pull()/ping resumes it cleanly once the gate opens. The gate is
    // strictly time-bounded on the SyncService side, so this can never starve a
    // root -- it only delays it briefly.
    if (this.canPull && !this.canPull()) {
      return;
    }

    debug(`Initializing consumer for ${this.input.type}`);

    const message: SynchronizerInputMessage = {
      id: this.id,
      type: 'synchronizer.input',
      userId: this.workspace.userId,
      input: this.input,
      cursor: this.cursor.toString(),
    };

    const sent = this.connection.send(message);
    if (sent) {
      this.status = 'waiting';
    }
  }

  private async fetchCursor() {
    const cursor = await this.workspace.database
      .selectFrom('cursors')
      .select('value')
      .where('key', '=', this.cursorKey)
      .executeTakeFirst();

    return cursor?.value ?? '0';
  }

  private async saveCursor(cursor: string) {
    await this.workspace.database
      .insertInto('cursors')
      .values({
        key: this.cursorKey,
        value: cursor,
        created_at: new Date().toISOString(),
      })
      .onConflict((eb) =>
        eb.column('key').doUpdateSet({
          value: cursor,
          updated_at: new Date().toISOString(),
        })
      )
      .execute();
  }

  public destroy() {
    this.eventLoop.stop();
    this.healLoop?.stop();
    this.healLoop = null;
    eventBus.unsubscribe(this.eventSubscriptionId);
  }

  public async delete() {
    this.destroy();

    await this.workspace.database
      .deleteFrom('cursors')
      .where('key', '=', this.cursorKey)
      .execute();
  }

  // Periodic self-healing re-sync: rewind the cursor by a bounded window and
  // re-pull so an out-of-order commit that slipped below the cursor gets
  // delivered. Safe ONLY for streams whose re-apply is side-effect-free --
  // documents/nodes are CRDT merges; tombstones/collaborations are revision-
  // guarded. Enabled for document updates, node tombstones, node updates AND
  // collaborations (see sync-service). Node-update healing is safe ONLY because
  // tryCreateServerNode consults the node_tombstones resurrection guard -- do
  // not weaken that guard on the assumption node updates are never re-delivered.
  private heal() {
    if (!this.healable || this.status !== 'idle') {
      return;
    }
    if (!this.connection.isConnected()) {
      return;
    }

    const current = BigInt(this.cursor);
    if (current <= 0n) {
      return;
    }

    const rewound = computeHealCursor(current, HEAL_LOOKBACK);
    // Only rewind the in-memory cursor; the re-pull re-advances it and
    // saveCursor persists the new high-water mark, so an interrupted heal never
    // leaves a regressed persisted cursor.
    this.healing = true;
    this.cursor = rewound.toString();
    this.initConsumer();
  }

  private generateId() {
    return sha256(
      JSON.stringify({
        userId: this.workspace.userId,
        input: this.input,
      })
    );
  }
}
