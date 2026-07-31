import ms from 'ms';

import { eventBus } from '@colanode/client/lib/event-bus';
import { Synchronizer } from '@colanode/client/services/workspaces/synchronizer';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import { Event } from '@colanode/client/types/events';
import {
  createDebugger,
  SyncCollaborationsInput,
  SyncUsersInput,
  SyncNodeUpdatesInput,
  SyncNodeInteractionsInput,
  SyncNodeReactionsInput,
  SyncNodeTombstonesInput,
  SyncNodeInteractionData,
  SyncNodeReactionData,
  SyncNodeTombstoneData,
  SyncNodeUpdateData,
  SyncUserData,
  SyncCollaborationData,
  SyncDocumentUpdatesInput,
  SyncDocumentUpdateData,
  SyncNotificationsInput,
  SyncNotificationData,
  SyncNotificationMutesInput,
  SyncNotificationMuteData,
} from '@colanode/core';

interface RootSynchronizers {
  nodeUpdates: Synchronizer<SyncNodeUpdatesInput>;
  nodeInteractions: Synchronizer<SyncNodeInteractionsInput>;
  nodeReactions: Synchronizer<SyncNodeReactionsInput>;
  nodeTombstones: Synchronizer<SyncNodeTombstonesInput>;
  documentUpdates: Synchronizer<SyncDocumentUpdatesInput>;
}

type SyncHandlers = {
  users: (data: SyncUserData) => Promise<void>;
  collaborations: (data: SyncCollaborationData) => Promise<void>;
  nodeUpdates: (data: SyncNodeUpdateData) => Promise<void>;
  nodeInteractions: (data: SyncNodeInteractionData) => Promise<void>;
  nodeReactions: (data: SyncNodeReactionData) => Promise<void>;
  nodeTombstones: (data: SyncNodeTombstoneData) => Promise<void>;
  documentUpdates: (data: SyncDocumentUpdateData) => Promise<void>;
  notifications: (data: SyncNotificationData) => Promise<void>;
  notificationMutes: (data: SyncNotificationMuteData) => Promise<void>;
};

const debug = createDebugger('desktop:service:sync');

export class SyncService {
  // How long the currently-opened root is allowed to back-fill on its own
  // before every other root resumes. A hard upper bound: prioritization only
  // ever reorders the first few seconds of a cold sync -- it never drops or
  // indefinitely delays any root. Kept short so background spaces are only
  // briefly behind the open one.
  private static readonly PRIORITY_WINDOW_MS = ms('6 seconds');

  private readonly workspace: WorkspaceService;

  private readonly rootSynchronizers: Map<string, RootSynchronizers> =
    new Map();

  private readonly syncHandlers: SyncHandlers;

  // The root ("space") the user currently has open. While set (and within the
  // window below) its synchronizers pull first and the other roots defer.
  private priorityRootId: string | null = null;
  private priorityDeadline: number = 0;
  private priorityTimer: ReturnType<typeof setTimeout> | null = null;

  // A just-opened node whose root isn't known locally yet (deep link into a
  // page that hasn't synced during a cold sync). Resolved to a root -- and
  // promoted to priority -- the moment that node arrives via sync.
  private pendingPriorityNodeId: string | null = null;

  private userSynchronizer: Synchronizer<SyncUsersInput> | undefined;
  private collaborationSynchronizer:
    | Synchronizer<SyncCollaborationsInput>
    | undefined;
  private notificationSynchronizer:
    | Synchronizer<SyncNotificationsInput>
    | undefined;
  private notificationMuteSynchronizer:
    | Synchronizer<SyncNotificationMutesInput>
    | undefined;

  constructor(workspaceService: WorkspaceService) {
    this.workspace = workspaceService;
    this.syncHandlers = {
      users: this.workspace.users.syncServerUser.bind(this.workspace.users),
      collaborations:
        this.workspace.collaborations.syncServerCollaboration.bind(
          this.workspace.collaborations
        ),
      nodeUpdates: this.workspace.nodes.syncServerNodeUpdate.bind(
        this.workspace.nodes
      ),
      nodeInteractions:
        this.workspace.nodeInteractions.syncServerNodeInteraction.bind(
          this.workspace.nodes
        ),
      nodeReactions: this.workspace.nodeReactions.syncServerNodeReaction.bind(
        this.workspace.nodes
      ),
      nodeTombstones: this.workspace.nodes.syncServerNodeDelete.bind(
        this.workspace.nodes
      ),
      documentUpdates: this.workspace.documents.syncServerDocumentUpdate.bind(
        this.workspace.documents
      ),
      notifications:
        this.workspace.notifications.syncServerNotification.bind(
          this.workspace.notifications
        ),
      notificationMutes:
        this.workspace.notificationMutes.syncServerNotificationMute.bind(
          this.workspace.notificationMutes
        ),
    };
    eventBus.subscribe(this.handleEvent.bind(this));
  }

  private handleEvent(event: Event): void {
    if (
      event.type === 'collaboration.created' &&
      event.workspace.userId === this.workspace.userId
    ) {
      this.initRootSynchronizers(event.nodeId);
    } else if (
      event.type === 'collaboration.deleted' &&
      event.workspace.userId === this.workspace.userId
    ) {
      this.removeRootSynchronizers(event.nodeId);
      if (this.priorityRootId === event.nodeId) {
        this.clearPriority();
      }
    } else if (
      event.type === 'metadata.updated' &&
      event.metadata.namespace === this.workspace.userId &&
      event.metadata.key === 'location'
    ) {
      // The user navigated: prioritize whatever node/space they just opened.
      const nodeId = this.parseOpenNodeId(event.metadata.value);
      if (nodeId) {
        void this.applyPriorityFromNodeId(nodeId);
      }
    } else if (
      (event.type === 'node.created' || event.type === 'node.updated') &&
      this.pendingPriorityNodeId !== null &&
      event.workspace.userId === this.workspace.userId &&
      event.node.id === this.pendingPriorityNodeId
    ) {
      // The node we were waiting on has now synced -- its root is known, so we
      // can finally prioritize it.
      this.setPriorityRoot(event.node.rootId);
    }
  }

  public async init() {
    debug(
      `Initializing sync service for workspace ${this.workspace.workspaceId}`
    );

    if (!this.userSynchronizer) {
      this.userSynchronizer = new Synchronizer(
        this.workspace,
        { type: 'users' },
        'users',
        this.syncHandlers.users
      );

      await this.userSynchronizer.init();
    }

    if (!this.collaborationSynchronizer) {
      this.collaborationSynchronizer = new Synchronizer(
        this.workspace,
        { type: 'collaborations' },
        'collaborations',
        this.syncHandlers.collaborations
      );

      await this.collaborationSynchronizer.init();
    }

    if (!this.notificationSynchronizer) {
      this.notificationSynchronizer = new Synchronizer(
        this.workspace,
        { type: 'notifications' },
        'notifications',
        this.syncHandlers.notifications
      );

      await this.notificationSynchronizer.init();
    }

    if (!this.notificationMuteSynchronizer) {
      this.notificationMuteSynchronizer = new Synchronizer(
        this.workspace,
        { type: 'notification-mutes' },
        'notification-mutes',
        this.syncHandlers.notificationMutes
      );

      await this.notificationMuteSynchronizer.init();
    }

    const collaborations =
      this.workspace.collaborations.getActiveCollaborations();

    // Resolve the currently-open node's root from the persisted workspace
    // location and mark it as the priority BEFORE the per-root synchronizers
    // are created, so on a (re)connect the open space pulls first and the
    // others briefly defer, instead of all ~N spaces syncing at equal weight.
    await this.armPriorityFromCurrentLocation();

    for (const collaboration of collaborations) {
      await this.initRootSynchronizers(collaboration.node_id);
    }
  }

  public destroy(): void {
    if (this.priorityTimer) {
      clearTimeout(this.priorityTimer);
      this.priorityTimer = null;
    }

    this.userSynchronizer?.destroy();
    this.collaborationSynchronizer?.destroy();
    this.notificationSynchronizer?.destroy();
    this.notificationMuteSynchronizer?.destroy();

    for (const rootSynchronizers of this.rootSynchronizers.values()) {
      this.destroyRootSynchronizers(rootSynchronizers);
    }
  }

  private destroyRootSynchronizers(rootSynchronizers: RootSynchronizers): void {
    rootSynchronizers.nodeUpdates.destroy();
    rootSynchronizers.nodeInteractions.destroy();
    rootSynchronizers.nodeReactions.destroy();
    rootSynchronizers.nodeTombstones.destroy();
    rootSynchronizers.documentUpdates.destroy();
  }

  private async initRootSynchronizers(rootId: string): Promise<void> {
    if (this.rootSynchronizers.has(rootId)) {
      return;
    }

    debug(
      `Initializing root synchronizers for root ${rootId} in workspace ${this.workspace.workspaceId}`
    );

    // Gate shared by all of this root's synchronizers: while another root has
    // priority, this root holds its pulls (bounded by PRIORITY_WINDOW_MS).
    const canPull = () => this.canSyncRoot(rootId);

    const rootSynchronizers = {
      nodeUpdates: new Synchronizer(
        this.workspace,
        { type: 'node.updates', rootId },
        `${rootId}.node.updates`,
        this.syncHandlers.nodeUpdates,
        canPull
      ),
      nodeInteractions: new Synchronizer(
        this.workspace,
        { type: 'node.interactions', rootId },
        `${rootId}.node.interactions`,
        this.syncHandlers.nodeInteractions,
        canPull
      ),
      nodeReactions: new Synchronizer(
        this.workspace,
        { type: 'node.reactions', rootId },
        `${rootId}.node.reactions`,
        this.syncHandlers.nodeReactions,
        canPull
      ),
      nodeTombstones: new Synchronizer(
        this.workspace,
        { type: 'node.tombstones', rootId },
        `${rootId}.node.tombstones`,
        this.syncHandlers.nodeTombstones,
        canPull
      ),
      documentUpdates: new Synchronizer(
        this.workspace,
        { type: 'document.updates', rootId },
        `${rootId}.document.updates`,
        this.syncHandlers.documentUpdates,
        canPull
      ),
    };

    this.rootSynchronizers.set(rootId, rootSynchronizers);
    await Promise.all(
      Object.values(rootSynchronizers).map((synchronizer) =>
        synchronizer.init()
      )
    );
  }

  private removeRootSynchronizers(rootId: string): void {
    const rootSynchronizers = this.rootSynchronizers.get(rootId);
    if (!rootSynchronizers) {
      return;
    }

    this.destroyRootSynchronizers(rootSynchronizers);
    this.rootSynchronizers.delete(rootId);
  }

  /**
   * The back-pressure gate consulted by every root synchronizer before it
   * pulls. Returns true (pull allowed) when there is no active priority, when
   * this IS the priority root, or when the priority window has elapsed. The
   * elapsed-window check is a hard safety net: even if the release timer is
   * ever delayed, no root is held past the deadline -- so every root always
   * syncs to completion.
   */
  private canSyncRoot(rootId: string): boolean {
    if (this.priorityRootId === null) {
      return true;
    }

    if (Date.now() >= this.priorityDeadline) {
      return true;
    }

    return this.priorityRootId === rootId;
  }

  /**
   * Mark a root as the one to sync first. Only ever prioritizes a root the user
   * actually collaborates on; otherwise it falls through with no priority (the
   * original fully-concurrent behavior) rather than gating every other root
   * behind a root that would never sync.
   */
  private setPriorityRoot(rootId: string): void {
    const isKnownRoot =
      this.rootSynchronizers.has(rootId) ||
      this.workspace.collaborations.getCollaboration(rootId) !== undefined;

    if (!isKnownRoot) {
      return;
    }

    this.pendingPriorityNodeId = null;

    const alreadyPriority = this.priorityRootId === rootId;

    this.priorityRootId = rootId;
    this.priorityDeadline = Date.now() + SyncService.PRIORITY_WINDOW_MS;

    if (this.priorityTimer) {
      clearTimeout(this.priorityTimer);
    }
    this.priorityTimer = setTimeout(() => {
      this.clearPriority();
    }, SyncService.PRIORITY_WINDOW_MS);

    debug(
      `Prioritizing root ${rootId} for sync in workspace ${this.workspace.workspaceId}`
    );

    // Nudge the priority root's synchronizers to pull now (its siblings will
    // see, on their own next attempt, that they are non-priority and defer).
    if (!alreadyPriority) {
      const rootSynchronizers = this.rootSynchronizers.get(rootId);
      if (rootSynchronizers) {
        for (const synchronizer of Object.values(rootSynchronizers)) {
          synchronizer.pull();
        }
      }
    }
  }

  /**
   * Release the priority and immediately wake every root so any that had been
   * deferring resume their back-fill at once (rather than waiting for their
   * next periodic ping).
   */
  private clearPriority(): void {
    if (this.priorityTimer) {
      clearTimeout(this.priorityTimer);
      this.priorityTimer = null;
    }

    if (this.priorityRootId === null) {
      return;
    }

    debug(
      `Clearing sync priority (was root ${this.priorityRootId}) in workspace ${this.workspace.workspaceId}`
    );

    this.priorityRootId = null;
    this.priorityDeadline = 0;

    for (const rootSynchronizers of this.rootSynchronizers.values()) {
      for (const synchronizer of Object.values(rootSynchronizers)) {
        synchronizer.pull();
      }
    }
  }

  /**
   * Resolve an opened node id to its root and prioritize it. If the node is
   * itself a root, that's immediate; otherwise its root is read from the local
   * copy. If the node hasn't synced yet (deep link during a cold sync), it is
   * remembered and resolved once it arrives (see handleEvent).
   */
  private async applyPriorityFromNodeId(nodeId: string): Promise<void> {
    if (this.workspace.collaborations.getCollaboration(nodeId)) {
      this.setPriorityRoot(nodeId);
      return;
    }

    try {
      const row = await this.workspace.database
        .selectFrom('nodes')
        .select('root_id')
        .where('id', '=', nodeId)
        .executeTakeFirst();

      if (row?.root_id) {
        this.setPriorityRoot(row.root_id);
      } else {
        this.pendingPriorityNodeId = nodeId;
      }
    } catch (error) {
      debug(`Error resolving priority root for node ${nodeId}: ${error}`);
    }
  }

  /**
   * Read the persisted workspace location and prioritize its node's root, so a
   * (re)connect resumes with the open space first.
   */
  private async armPriorityFromCurrentLocation(): Promise<void> {
    try {
      const metadata = await this.workspace.account.app.metadata.get(
        this.workspace.userId,
        'location'
      );

      if (!metadata) {
        return;
      }

      const nodeId = this.parseOpenNodeId(metadata.value);
      if (nodeId) {
        await this.applyPriorityFromNodeId(nodeId);
      }
    } catch (error) {
      debug(`Error arming initial sync priority: ${error}`);
    }
  }

  /**
   * Extract the opened node id from a persisted `location` metadata value. The
   * value is the workspace route href (usually JSON-encoded), e.g.
   * `/workspace/{userId}/{nodeId}`; the node id is the first path segment after
   * the workspace prefix. Returns null when the location isn't a node route.
   */
  private parseOpenNodeId(rawValue: string): string | null {
    let href = rawValue;
    try {
      const parsed = JSON.parse(rawValue);
      if (typeof parsed === 'string') {
        href = parsed;
      }
    } catch {
      // Not JSON-encoded -- use the raw value as-is.
    }

    const prefix = `/workspace/${this.workspace.userId}/`;
    const index = href.indexOf(prefix);
    if (index === -1) {
      return null;
    }

    const rest = href.slice(index + prefix.length);
    const segment = rest.split(/[/?#]/)[0];
    return segment && segment.length > 0 ? segment : null;
  }
}
