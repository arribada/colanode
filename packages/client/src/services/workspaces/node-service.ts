import {
  CreateNodeReference,
  SelectNode,
  SelectNodeReference,
} from '@colanode/client/databases/workspace';
import { eventBus } from '@colanode/client/lib/event-bus';
import {
  mapDownload,
  mapNode,
  mapNodeAttributes,
  mapNodeReference,
  mapUpload,
} from '@colanode/client/lib/mappers';
import {
  applyMentionUpdates,
  checkMentionChanges,
} from '@colanode/client/lib/mentions';
import { deleteNodeRelations, fetchNodeTree } from '@colanode/client/lib/utils';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import {
  DownloadStatus,
  LocalNode,
  LocalDatabaseNode,
} from '@colanode/client/types';
import {
  generateId,
  IdType,
  createDebugger,
  NodeAttributes,
  DeleteNodeMutationData,
  SyncNodeUpdateData,
  SyncNodeTombstoneData,
  getNodeModel,
  CreateNodeMutationData,
  UpdateNodeMutationData,
  CanCreateNodeContext,
  CanUpdateAttributesContext,
  CanDeleteNodeContext,
  DatabaseAutomationAction,
  FieldValue,
  FieldAttributes,
  AiCompleteInput,
  AiCompleteOutput,
} from '@colanode/core';
import { decodeState, encodeState, YDoc } from '@colanode/crdt';
import {
  buildAutomationAiContext,
  buildAutomationFieldValue,
  changedFieldIds,
  matchingAutomations,
  AutomationTriggerType,
} from '@colanode/client/lib/database-automations';

const UPDATE_RETRIES_LIMIT = 20;

export type CreateNodeInput = {
  id: string;
  attributes: NodeAttributes;
  parentId: string | null;
};

export type UpdateNodeResult =
  | 'success'
  | 'not_found'
  | 'unauthorized'
  | 'failed'
  | 'invalid_attributes';

const debug = createDebugger('desktop:service:node');

export class NodeService {
  private readonly workspace: WorkspaceService;

  // Records whose automations are currently running. Guards against infinite
  // loops: a set_field/ai_fill action issues its own node.update, which would
  // otherwise re-trigger this database's record_updated automations.
  private readonly automationsInFlight = new Set<string>();

  constructor(workspaceService: WorkspaceService) {
    this.workspace = workspaceService;
  }

  public async createNode(input: CreateNodeInput): Promise<SelectNode> {
    debug(`Creating ${Array.isArray(input) ? 'nodes' : 'node'}`);

    const tree = input.parentId
      ? await fetchNodeTree(this.workspace.database, input.parentId)
      : [];

    const model = getNodeModel(input.attributes.type);
    const canCreateNodeContext: CanCreateNodeContext = {
      user: {
        id: this.workspace.userId,
        role: this.workspace.role,
        workspaceId: this.workspace.workspaceId,
        accountId: this.workspace.accountId,
      },
      tree: tree,
      attributes: input.attributes,
    };

    if (!model.canCreate(canCreateNodeContext)) {
      throw new Error('Insufficient permissions');
    }

    const ydoc = new YDoc();
    const update = ydoc.update(model.attributesSchema, input.attributes);

    if (!update) {
      throw new Error('Invalid attributes');
    }

    const updateId = generateId(IdType.Update);
    const createdAt = new Date().toISOString();
    const rootId = tree[0]?.id ?? input.id;
    const nodeText = model.extractText(input.id, input.attributes);
    const mentions = model.extractMentions(input.id, input.attributes);
    const nodeReferencesToCreate: CreateNodeReference[] = mentions.map(
      (mention) => ({
        node_id: input.id,
        reference_id: mention.target,
        inner_id: mention.id,
        type: 'mention',
        created_at: createdAt,
        created_by: this.workspace.userId,
      })
    );

    const { createdNode, createdMutation, createdNodeReferences } =
      await this.workspace.database.transaction().execute(async (trx) => {
        const createdNode = await trx
          .insertInto('nodes')
          .returningAll()
          .values({
            id: input.id,
            root_id: rootId,
            attributes: JSON.stringify(input.attributes),
            created_at: createdAt,
            created_by: this.workspace.userId,
            local_revision: '0',
            server_revision: '0',
          })
          .executeTakeFirst();

        if (!createdNode) {
          throw new Error('Failed to create node');
        }

        const createdNodeUpdate = await trx
          .insertInto('node_updates')
          .returningAll()
          .values({
            id: updateId,
            node_id: input.id,
            data: update,
            created_at: createdAt,
          })
          .executeTakeFirst();

        if (!createdNodeUpdate) {
          throw new Error('Failed to create node update');
        }

        const mutationData: CreateNodeMutationData = {
          nodeId: input.id,
          updateId: updateId,
          data: encodeState(update),
          createdAt: createdAt,
        };

        const createdMutation = await trx
          .insertInto('mutations')
          .returningAll()
          .values({
            id: generateId(IdType.Mutation),
            type: 'node.create',
            data: JSON.stringify(mutationData),
            created_at: createdAt,
            retries: 0,
          })
          .executeTakeFirst();

        if (!createdMutation) {
          throw new Error('Failed to create mutation');
        }

        if (nodeText) {
          await trx
            .deleteFrom('node_texts')
            .where('id', '=', input.id)
            .execute();

          await trx
            .insertInto('node_texts')
            .values({
              id: input.id,
              name: nodeText.name,
              attributes: nodeText.attributes,
            })
            .execute();
        }

        let createdNodeReferences: SelectNodeReference[] = [];
        if (nodeReferencesToCreate.length > 0) {
          createdNodeReferences = await trx
            .insertInto('node_references')
            .values(nodeReferencesToCreate)
            .returningAll()
            .execute();
        }

        return {
          createdNode,
          createdMutation,
          createdNodeReferences,
        };
      });

    if (!createdNode) {
      throw new Error('Failed to create node');
    }

    if (!createdMutation) {
      throw new Error('Failed to create mutation');
    }

    debug(`Created node ${createdNode.id} with type ${createdNode.type}`);

    eventBus.publish({
      type: 'node.created',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      node: mapNode(createdNode),
    });

    for (const createdNodeReference of createdNodeReferences) {
      eventBus.publish({
        type: 'node.reference.created',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeReference: mapNodeReference(createdNodeReference),
      });
    }

    this.workspace.mutations.scheduleSync();
    return createdNode;
  }

  public async insertNode(
    id: string,
    attributes: NodeAttributes
  ): Promise<LocalNode> {
    debug(`Inserting node ${id} with type ${attributes.type}`);

    let tree: LocalNode[] = [];
    if (attributes.type !== 'space' && attributes.type !== 'chat') {
      tree = await fetchNodeTree(this.workspace.database, attributes.parentId!);
    }

    const model = getNodeModel(attributes.type);
    const canCreateNodeContext: CanCreateNodeContext = {
      user: {
        id: this.workspace.userId,
        role: this.workspace.role,
        workspaceId: this.workspace.workspaceId,
        accountId: this.workspace.accountId,
      },
      tree: tree,
      attributes: attributes,
    };

    if (!model.canCreate(canCreateNodeContext)) {
      throw new Error('Insufficient permissions');
    }

    const ydoc = new YDoc();
    const update = ydoc.update(model.attributesSchema, attributes);

    if (!update) {
      throw new Error('Invalid attributes');
    }

    const updateId = generateId(IdType.Update);
    const createdAt = new Date().toISOString();
    const rootId = tree[0]?.id ?? id;
    const nodeText = model.extractText(id, attributes);
    const mentions = model.extractMentions(id, attributes);
    const nodeReferencesToCreate: CreateNodeReference[] = mentions.map(
      (mention) => ({
        node_id: id,
        reference_id: mention.target,
        inner_id: mention.id,
        type: 'mention',
        created_at: createdAt,
        created_by: this.workspace.userId,
      })
    );

    const { createdNode, createdMutation, createdNodeReferences } =
      await this.workspace.database.transaction().execute(async (trx) => {
        const createdNode = await trx
          .insertInto('nodes')
          .returningAll()
          .values({
            id: id,
            root_id: rootId,
            attributes: JSON.stringify(attributes),
            created_at: createdAt,
            created_by: this.workspace.userId,
            local_revision: '0',
            server_revision: '0',
          })
          .executeTakeFirst();

        if (!createdNode) {
          throw new Error('Failed to create node');
        }

        const createdNodeUpdate = await trx
          .insertInto('node_updates')
          .returningAll()
          .values({
            id: updateId,
            node_id: id,
            data: update,
            created_at: createdAt,
          })
          .executeTakeFirst();

        if (!createdNodeUpdate) {
          throw new Error('Failed to create node update');
        }

        const mutationData: CreateNodeMutationData = {
          nodeId: id,
          updateId: updateId,
          data: encodeState(update),
          createdAt: createdAt,
        };

        const createdMutation = await trx
          .insertInto('mutations')
          .returningAll()
          .values({
            id: generateId(IdType.Mutation),
            type: 'node.create',
            data: JSON.stringify(mutationData),
            created_at: createdAt,
            retries: 0,
          })
          .executeTakeFirst();

        if (!createdMutation) {
          throw new Error('Failed to create mutation');
        }

        if (nodeText) {
          await trx
            .deleteFrom('node_texts')
            .where('id', '=', id)
            .execute();

          await trx
            .insertInto('node_texts')
            .values({
              id: id,
              name: nodeText.name,
              attributes: nodeText.attributes,
            })
            .execute();
        }

        let createdNodeReferences: SelectNodeReference[] = [];
        if (nodeReferencesToCreate.length > 0) {
          createdNodeReferences = await trx
            .insertInto('node_references')
            .values(nodeReferencesToCreate)
            .returningAll()
            .execute();
        }

        return {
          createdNode,
          createdMutation,
          createdNodeReferences,
        };
      });

    if (!createdNode) {
      throw new Error('Failed to create node');
    }

    if (!createdMutation) {
      throw new Error('Failed to create mutation');
    }

    debug(`Created node ${createdNode.id} with type ${createdNode.type}`);

    eventBus.publish({
      type: 'node.created',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      node: mapNode(createdNode),
    });

    for (const createdNodeReference of createdNodeReferences) {
      eventBus.publish({
        type: 'node.reference.created',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeReference: mapNodeReference(createdNodeReference),
      });
    }

    if (attributes.type === 'record') {
      const databaseNode = tree[tree.length - 1];
      if (databaseNode && databaseNode.type === 'database') {
        await this.runRecordAutomations(
          'record_created',
          id,
          databaseNode,
          attributes.fields,
          undefined
        );
      }
    }

    this.workspace.mutations.scheduleSync();
    return mapNode(createdNode);
  }

  public async updateNode<T extends NodeAttributes>(
    nodeId: string,
    updater: (attributes: T) => T
  ): Promise<UpdateNodeResult> {
    for (let count = 0; count < UPDATE_RETRIES_LIMIT; count++) {
      const result = await this.tryUpdateNode(nodeId, updater);
      if (result) {
        return result;
      }
    }

    return 'failed';
  }

  private async tryUpdateNode<T extends NodeAttributes>(
    nodeId: string,
    updater: (attributes: T) => T
  ): Promise<UpdateNodeResult | null> {
    debug(`Updating node ${nodeId}`);

    const tree = await fetchNodeTree(this.workspace.database, nodeId);
    const node = tree[tree.length - 1];
    if (!node || node.id !== nodeId) {
      return 'not_found';
    }

    const updateId = generateId(IdType.Update);
    const updatedAt = new Date().toISOString();
    const updatedAttributes = updater(mapNodeAttributes(node) as T);

    const canUpdateAttributesContext: CanUpdateAttributesContext = {
      user: {
        id: this.workspace.userId,
        role: this.workspace.role,
        workspaceId: this.workspace.workspaceId,
        accountId: this.workspace.accountId,
      },
      tree: tree,
      node: node,
      attributes: updatedAttributes,
    };

    const model = getNodeModel(updatedAttributes.type);
    if (!model.canUpdateAttributes(canUpdateAttributesContext)) {
      return 'unauthorized';
    }

    const nodeState = await this.workspace.database
      .selectFrom('node_states')
      .where('id', '=', nodeId)
      .selectAll()
      .executeTakeFirst();

    const nodeUpdates = await this.workspace.database
      .selectFrom('node_updates')
      .where('node_id', '=', nodeId)
      .selectAll()
      .execute();

    const ydoc = new YDoc(nodeState?.state);
    for (const update of nodeUpdates) {
      ydoc.applyUpdate(update.data);
    }

    const update = ydoc.update(model.attributesSchema, updatedAttributes);

    if (!update) {
      return 'success';
    }

    const attributes = ydoc.getObject<NodeAttributes>();
    const localRevision = BigInt(node.localRevision) + BigInt(1);
    const nodeText = model.extractText(nodeId, attributes);

    const beforeMentions = model.extractMentions(nodeId, node);
    const afterMentions = model.extractMentions(nodeId, attributes);
    const mentionChanges = checkMentionChanges(beforeMentions, afterMentions);

    const {
      updatedNode,
      createdMutation,
      createdNodeReferences,
      deletedNodeReferences,
    } = await this.workspace.database.transaction().execute(async (trx) => {
      const updatedNode = await trx
        .updateTable('nodes')
        .returningAll()
        .set({
          attributes: JSON.stringify(attributes),
          updated_at: updatedAt,
          updated_by: this.workspace.userId,
          local_revision: localRevision.toString(),
        })
        .where('id', '=', nodeId)
        .where('local_revision', '=', node.localRevision)
        .executeTakeFirst();

      if (!updatedNode) {
        throw new Error('Failed to update node');
      }

      const createdUpdate = await trx
        .insertInto('node_updates')
        .returningAll()
        .values({
          id: updateId,
          node_id: nodeId,
          data: update,
          created_at: updatedAt,
        })
        .executeTakeFirst();

      if (!createdUpdate) {
        throw new Error('Failed to create update');
      }

      const mutationData: UpdateNodeMutationData = {
        nodeId: nodeId,
        updateId: updateId,
        data: encodeState(update),
        createdAt: updatedAt,
      };

      const createdMutation = await trx
        .insertInto('mutations')
        .returningAll()
        .values({
          id: generateId(IdType.Mutation),
          type: 'node.update',
          data: JSON.stringify(mutationData),
          created_at: updatedAt,
          retries: 0,
        })
        .executeTakeFirst();

      if (!createdMutation) {
        throw new Error('Failed to create mutation');
      }

      if (nodeText) {
        await trx
          .deleteFrom('node_texts')
          .where('id', '=', nodeId)
          .execute();

        await trx
          .insertInto('node_texts')
          .values({
            id: nodeId,
            name: nodeText.name,
            attributes: nodeText.attributes,
          })
          .execute();
      }

      const { createdNodeReferences, deletedNodeReferences } =
        await applyMentionUpdates(
          trx,
          nodeId,
          this.workspace.userId,
          updatedAt,
          mentionChanges
        );

      return {
        updatedNode,
        createdMutation,
        createdNodeReferences,
        deletedNodeReferences,
      };
    });

    if (updatedNode) {
      debug(`Updated node ${updatedNode.id} with type ${updatedNode.type}`);

      eventBus.publish({
        type: 'node.updated',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        node: mapNode(updatedNode),
      });
    } else {
      debug(`Failed to update node ${nodeId}`);
    }

    if (createdMutation) {
      this.workspace.mutations.scheduleSync();
    }

    for (const createdNodeReference of createdNodeReferences) {
      eventBus.publish({
        type: 'node.reference.created',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeReference: mapNodeReference(createdNodeReference),
      });
    }

    for (const deletedNodeReference of deletedNodeReferences) {
      eventBus.publish({
        type: 'node.reference.deleted',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeReference: mapNodeReference(deletedNodeReference),
      });
    }

    if (updatedNode) {
      if (attributes.type === 'record') {
        const databaseNode = tree[tree.length - 2];
        if (databaseNode && databaseNode.type === 'database') {
          const before =
            node.type === 'record' ? node.fields : undefined;
          const changed = changedFieldIds(before, attributes.fields);
          await this.runRecordAutomations(
            'record_updated',
            nodeId,
            databaseNode,
            attributes.fields,
            changed
          );
        }
      }
      return 'success';
    }

    return null;
  }

  // --- Database automations engine (client-side) ---------------------------
  // Evaluates a parent database's enabled automations after a record is
  // created/updated and applies their actions. Runs on the ACTING CLIENT only
  // (the client that made the record mutation); it does not run server-side.
  private async runRecordAutomations(
    trigger: AutomationTriggerType,
    recordId: string,
    databaseNode: LocalDatabaseNode,
    recordFields: Record<string, FieldValue>,
    changed: Set<string> | undefined
  ): Promise<void> {
    // Loop guard: if we are already inside this record's automations, a
    // set_field/ai_fill action's own node.update must NOT re-trigger them.
    if (this.automationsInFlight.has(recordId)) {
      return;
    }

    const automations = matchingAutomations(
      databaseNode.automations,
      trigger,
      changed
    );
    if (automations.length === 0) {
      return;
    }

    this.automationsInFlight.add(recordId);
    try {
      for (const automation of automations) {
        for (const action of automation.actions) {
          try {
            await this.applyAutomationAction(
              recordId,
              databaseNode,
              recordFields,
              automation.name,
              action
            );
          } catch (error) {
            debug(
              'Automation ' +
                automation.name +
                ' action ' +
                action.type +
                ' failed: ' +
                String(error)
            );
          }
        }
      }
    } finally {
      this.automationsInFlight.delete(recordId);
    }
  }

  private async applyAutomationAction(
    recordId: string,
    databaseNode: LocalDatabaseNode,
    recordFields: Record<string, FieldValue>,
    automationName: string,
    action: DatabaseAutomationAction
  ): Promise<void> {
    if (action.type === 'notify') {
      const message =
        typeof action.value === 'string' && action.value.trim().length > 0
          ? action.value
          : 'Automation ' + automationName + ' ran';
      await this.createLocalNotification(
        recordId,
        databaseNode.rootId,
        message
      );
      return;
    }

    if (!action.fieldId) {
      return;
    }

    const fieldDef = databaseNode.fields[action.fieldId] as
      | FieldAttributes
      | undefined;
    if (!fieldDef) {
      return;
    }

    if (action.type === 'set_field') {
      const fieldValue = buildAutomationFieldValue(fieldDef.type, action.value);
      if (fieldValue === undefined) {
        return;
      }
      await this.writeRecordField(recordId, action.fieldId, fieldValue);
      return;
    }

    if (action.type === 'ai_fill') {
      const context = buildAutomationAiContext(
        recordFields,
        databaseNode.fields,
        action.fieldId
      );
      const prompt =
        action.prompt && action.prompt.trim().length > 0
          ? action.prompt
          : 'You are filling in the ' +
            fieldDef.name +
            ' property of a database record. Using the other properties as ' +
            'context, provide a concise, plausible value for ' +
            fieldDef.name +
            '. Return only the value text, with no labels or quotes.';

      const body: AiCompleteInput = {
        action: 'custom',
        prompt,
        selection: '',
        context,
      };

      const output = await this.workspace.account.client
        .post('v1/workspaces/' + this.workspace.workspaceId + '/ai/complete', {
          json: body,
        })
        .json<AiCompleteOutput>();

      const text = (output.text ?? '').trim();
      if (!text) {
        return;
      }

      const fieldValue = buildAutomationFieldValue(fieldDef.type, text);
      if (fieldValue === undefined || fieldValue === null) {
        return;
      }
      await this.writeRecordField(recordId, action.fieldId, fieldValue);
    }
  }

  private async writeRecordField(
    recordId: string,
    fieldId: string,
    value: FieldValue | null
  ): Promise<void> {
    await this.updateNode(recordId, (attributes) => {
      if (attributes.type !== 'record') {
        return attributes;
      }
      if (value === null) {
        const next = { ...attributes.fields };
        delete next[fieldId];
        attributes.fields = next;
      } else {
        attributes.fields = { ...attributes.fields, [fieldId]: value };
      }
      return attributes;
    });
  }

  private async createLocalNotification(
    recordId: string,
    rootId: string,
    message: string
  ): Promise<void> {
    const notificationId = generateId(IdType.Notification);
    const now = new Date().toISOString();

    await this.workspace.database
      .insertInto('notifications')
      .values({
        id: notificationId,
        user_id: this.workspace.userId,
        workspace_id: this.workspace.workspaceId,
        root_id: rootId,
        type: 'automation',
        source_node_id: recordId,
        actor_id: this.workspace.userId,
        preview: JSON.stringify({ message }),
        created_at: now,
        read_at: null,
        revision: '0',
      })
      .execute();

    eventBus.publish({
      type: 'notification.created',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      notificationId,
    });
  }

  public async deleteNode(nodeId: string) {
    const tree = await fetchNodeTree(this.workspace.database, nodeId);
    const node = tree[tree.length - 1];
    if (!node || node.id !== nodeId) {
      return 'not_found';
    }

    const model = getNodeModel(node.type);
    const canDeleteNodeContext: CanDeleteNodeContext = {
      user: {
        id: this.workspace.userId,
        role: this.workspace.role,
        workspaceId: this.workspace.workspaceId,
        accountId: this.workspace.accountId,
      },
      tree: tree,
      node: node,
    };

    if (!model.canDelete(canDeleteNodeContext)) {
      throw new Error('Insufficient permissions');
    }

    const { deletedNode, createdMutation } = await this.workspace.database
      .transaction()
      .execute(async (trx) => {
        const deletedNode = await trx
          .deleteFrom('nodes')
          .returningAll()
          .where('id', '=', nodeId)
          .executeTakeFirst();

        if (!deletedNode) {
          throw new Error('Failed to delete node');
        }

        await trx
          .insertInto('tombstones')
          .values({
            id: deletedNode.id,
            data: JSON.stringify(deletedNode),
            deleted_at: new Date().toISOString(),
          })
          .execute();

        const deleteMutationData: DeleteNodeMutationData = {
          nodeId: nodeId,
          rootId: node.rootId,
          deletedAt: new Date().toISOString(),
        };

        const createdMutation = await trx
          .insertInto('mutations')
          .returningAll()
          .values({
            id: generateId(IdType.Mutation),
            type: 'node.delete',
            data: JSON.stringify(deleteMutationData),
            created_at: new Date().toISOString(),
            retries: 0,
          })
          .executeTakeFirst();

        return { deletedNode, createdMutation };
      });

    if (!deletedNode || !createdMutation) {
      return;
    }

    debug(`Deleted node ${deletedNode.id} with type ${deletedNode.type}`);

    eventBus.publish({
      type: 'node.deleted',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      node: mapNode(deletedNode),
    });

    if (deletedNode.type === 'file') {
      const deletedUpload = await this.workspace.database
        .deleteFrom('uploads')
        .where('file_id', '=', deletedNode.id)
        .returningAll()
        .executeTakeFirst();

      if (deletedUpload) {
        eventBus.publish({
          type: 'upload.deleted',
          workspace: {
            workspaceId: this.workspace.workspaceId,
            userId: this.workspace.userId,
            accountId: this.workspace.accountId,
          },
          upload: mapUpload(deletedUpload),
        });
      }

      const updatedDownloads = await this.workspace.database
        .updateTable('downloads')
        .set({
          status: DownloadStatus.Failed,
          error_code: 'file_deleted',
          error_message: 'File has been deleted',
        })
        .where('file_id', '=', deletedNode.id)
        .where('status', 'in', [
          DownloadStatus.Pending,
          DownloadStatus.Downloading,
        ])
        .returningAll()
        .execute();

      if (updatedDownloads.length > 0) {
        for (const updatedDownload of updatedDownloads) {
          eventBus.publish({
            type: 'download.updated',
            workspace: {
              workspaceId: this.workspace.workspaceId,
              userId: this.workspace.userId,
              accountId: this.workspace.accountId,
            },
            download: mapDownload(updatedDownload),
          });
        }
      }
    }

    this.workspace.mutations.scheduleSync();
  }

  public async syncServerNodeUpdate(update: SyncNodeUpdateData) {
    for (let count = 0; count < UPDATE_RETRIES_LIMIT; count++) {
      try {
        const existingNode = await this.workspace.database
          .selectFrom('nodes')
          .where('id', '=', update.nodeId)
          .selectAll()
          .executeTakeFirst();

        if (!existingNode) {
          const result = await this.tryCreateServerNode(update);
          if (result) {
            return;
          }
        } else {
          const result = await this.tryUpdateServerNode(existingNode, update);
          if (result) {
            return;
          }
        }
      } catch (error) {
        debug(`Failed to update node ${update.id}: ${error}`);
      }
    }
  }

  private async tryCreateServerNode(
    update: SyncNodeUpdateData
  ): Promise<boolean> {
    // Resurrection guard: the healing re-sync (or any cursor rewind) can
    // re-deliver an OLD update for a node that has since been deleted. Creating
    // it here would bring the node back from the dead, so if we hold a tombstone
    // newer than this update, drop it.
    const nodeTombstone = await this.workspace.database
      .selectFrom('node_tombstones')
      .select('revision')
      .where('id', '=', update.nodeId)
      .executeTakeFirst();
    if (
      nodeTombstone &&
      BigInt(nodeTombstone.revision) > BigInt(update.revision)
    ) {
      debug(`Skipping recreate of deleted node ${update.nodeId}`);
      return true;
    }

    const ydoc = new YDoc(update.data);
    const attributes = ydoc.getObject<NodeAttributes>();

    const model = getNodeModel(attributes.type);
    const nodeText = model.extractText(update.nodeId, attributes);
    const mentions = model.extractMentions(update.nodeId, attributes);
    const nodeReferencesToCreate = mentions.map((mention) => ({
      node_id: update.nodeId,
      reference_id: mention.target,
      inner_id: mention.id,
      type: 'mention',
      created_at: update.createdAt,
      created_by: update.createdBy,
    }));

    const { createdNode, createdNodeReferences } = await this.workspace.database
      .transaction()
      .execute(async (trx) => {
        const createdNode = await trx
          .insertInto('nodes')
          .returningAll()
          .values({
            id: update.nodeId,
            root_id: update.rootId,
            attributes: JSON.stringify(attributes),
            created_at: update.createdAt,
            created_by: update.createdBy,
            local_revision: '0',
            server_revision: update.revision,
          })
          .executeTakeFirst();

        if (!createdNode) {
          throw new Error('Failed to create node');
        }

        await trx
          .insertInto('node_states')
          .returningAll()
          .values({
            id: update.nodeId,
            revision: update.revision,
            state: decodeState(update.data),
          })
          .executeTakeFirst();

        if (nodeText) {
          await trx
            .deleteFrom('node_texts')
            .where('id', '=', update.nodeId)
            .execute();

          await trx
            .insertInto('node_texts')
            .values({
              id: update.nodeId,
              name: nodeText.name,
              attributes: nodeText.attributes,
            })
            .execute();
        }

        let createdNodeReferences: SelectNodeReference[] = [];
        if (nodeReferencesToCreate.length > 0) {
          createdNodeReferences = await trx
            .insertInto('node_references')
            .values(nodeReferencesToCreate)
            .returningAll()
            .execute();
        }

        return { createdNode, createdNodeReferences };
      });

    if (!createdNode) {
      debug(`Failed to create node ${update.nodeId}`);
      return false;
    }

    debug(`Created node ${createdNode.id} with type ${createdNode.type}`);

    eventBus.publish({
      type: 'node.created',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      node: mapNode(createdNode),
    });

    for (const createdNodeReference of createdNodeReferences) {
      eventBus.publish({
        type: 'node.reference.created',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeReference: mapNodeReference(createdNodeReference),
      });
    }

    await this.workspace.nodeCounters.checkCountersForCreatedNode(
      createdNode,
      createdNodeReferences
    );

    return true;
  }

  private async tryUpdateServerNode(
    existingNode: SelectNode,
    update: SyncNodeUpdateData
  ): Promise<boolean> {
    const nodeState = await this.workspace.database
      .selectFrom('node_states')
      .where('id', '=', existingNode.id)
      .selectAll()
      .executeTakeFirst();

    const nodeUpdates = await this.workspace.database
      .selectFrom('node_updates')
      .selectAll()
      .where('node_id', '=', existingNode.id)
      .orderBy('id', 'asc')
      .execute();

    const ydoc = new YDoc(nodeState?.state);
    ydoc.applyUpdate(update.data);

    const serverState = ydoc.getState();

    for (const nodeUpdate of nodeUpdates) {
      if (nodeUpdate.id === update.id) {
        continue;
      }

      ydoc.applyUpdate(nodeUpdate.data);
    }

    const attributes = ydoc.getObject<NodeAttributes>();
    const localRevision = BigInt(existingNode.local_revision) + BigInt(1);

    const model = getNodeModel(attributes.type);
    const nodeText = model.extractText(existingNode.id, attributes);

    const beforeAttributes = JSON.parse(existingNode.attributes);
    const beforeMentions = model.extractMentions(
      existingNode.id,
      beforeAttributes
    );
    const afterMentions = model.extractMentions(existingNode.id, attributes);
    const mentionChanges = checkMentionChanges(beforeMentions, afterMentions);

    const mergedUpdateIds = update.mergedUpdates?.map((u) => u.id) ?? [];
    const updatesToDelete = [update.id, ...mergedUpdateIds];

    // A re-delivered update (e.g. from the healing re-sync) whose data is
    // already merged in leaves the attributes unchanged and has no local
    // pending row to clear -- skip the write entirely so heal costs nothing.
    const contentChanged =
      JSON.stringify(attributes) !== existingNode.attributes;
    const hasPendingUpdate = nodeUpdates.some((nodeUpdate) =>
      updatesToDelete.includes(nodeUpdate.id)
    );
    if (!contentChanged && !hasPendingUpdate) {
      return true;
    }

    // Metadata (root_id, updated_at/by, server_revision) only advances for an
    // update NEWER than what we already applied. Healing content from an OLD
    // re-delivered update merges its Yjs data (above) WITHOUT rolling back the
    // row's root_id -- otherwise re-applying a pre-move update would yank a
    // cross-space-moved node back to its old space.
    const advancesMetadata =
      BigInt(update.revision) > BigInt(existingNode.server_revision);

    const { updatedNode, createdNodeReferences, deletedNodeReferences } =
      await this.workspace.database.transaction().execute(async (trx) => {
        const updatedNode = await trx
          .updateTable('nodes')
          .returningAll()
          .set({
            // root_id follows the server: a cross-space move re-homes the whole
            // subtree there, and each node arrives here as an ordinary update
            // carrying its new rootId. Applying it keyed by node id relocates the
            // single local row in place — no delete/re-create, so a client that
            // can see both spaces never blinks the node out of existence.
            root_id: advancesMetadata ? update.rootId : existingNode.root_id,
            attributes: JSON.stringify(attributes),
            updated_at: advancesMetadata
              ? update.createdAt
              : existingNode.updated_at,
            updated_by: advancesMetadata
              ? update.createdBy
              : existingNode.updated_by,
            local_revision: localRevision.toString(),
            server_revision: advancesMetadata
              ? update.revision
              : existingNode.server_revision,
          })
          .where('id', '=', existingNode.id)
          .where('local_revision', '=', existingNode.local_revision)
          .executeTakeFirst();

        if (!updatedNode) {
          throw new Error('Failed to update node');
        }

        const upsertedState = await trx
          .insertInto('node_states')
          .returningAll()
          .values({
            id: existingNode.id,
            revision: update.revision,
            state: serverState,
          })
          .onConflict((cb) =>
            cb
              .doUpdateSet({
                revision: update.revision,
                state: serverState,
              })
              .where('revision', '=', nodeState?.revision ?? '0')
          )
          .executeTakeFirst();

        if (!upsertedState) {
          throw new Error('Failed to update node state');
        }

        if (nodeText) {
          await trx
            .deleteFrom('node_texts')
            .where('id', '=', existingNode.id)
            .execute();

          await trx
            .insertInto('node_texts')
            .values({
              id: existingNode.id,
              name: nodeText.name,
              attributes: nodeText.attributes,
            })
            .execute();
        }

        if (updatesToDelete.length > 0) {
          await trx
            .deleteFrom('node_updates')
            .where('id', 'in', updatesToDelete)
            .execute();
        }

        const { createdNodeReferences, deletedNodeReferences } =
          await applyMentionUpdates(
            trx,
            existingNode.id,
            update.createdBy,
            update.createdAt,
            mentionChanges
          );

        return { updatedNode, createdNodeReferences, deletedNodeReferences };
      });

    if (!updatedNode) {
      debug(`Failed to update node ${existingNode.id}`);
      return false;
    }

    debug(`Updated node ${updatedNode.id} with type ${updatedNode.type}`);

    eventBus.publish({
      type: 'node.updated',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      node: mapNode(updatedNode),
    });

    for (const createdNodeReference of createdNodeReferences) {
      eventBus.publish({
        type: 'node.reference.created',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeReference: mapNodeReference(createdNodeReference),
      });
    }

    for (const deletedNodeReference of deletedNodeReferences) {
      eventBus.publish({
        type: 'node.reference.deleted',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeReference: mapNodeReference(deletedNodeReference),
      });
    }

    return true;
  }

  public async syncServerNodeDelete(tombstone: SyncNodeTombstoneData) {
    debug(
      `Applying server delete transaction ${tombstone.id} for node ${tombstone.id}`
    );

    const { deletedNode, deletedCollaborations } = await this.workspace.database
      .transaction()
      .execute(async (trx) => {
        // Persist the tombstone durably (idempotent, keep the newest revision)
        // BEFORE touching the node and regardless of whether a local row exists,
        // so a later re-delivered update for this node (e.g. from the healing
        // re-sync) is recognized as deleted and not resurrected.
        await trx
          .insertInto('node_tombstones')
          .values({
            id: tombstone.id,
            root_id: tombstone.rootId,
            revision: tombstone.revision,
            created_at: tombstone.deletedAt,
          })
          .onConflict((oc) =>
            oc
              .column('id')
              .doUpdateSet({
                root_id: tombstone.rootId,
                revision: tombstone.revision,
                created_at: tombstone.deletedAt,
              })
              .where('revision', '<', tombstone.revision)
          )
          .execute();

        // Root-guard the delete. A cross-space move emits a tombstone in the OLD
        // root so a user who can see only that space drops the node. A user who
        // can see BOTH spaces has already relocated their local copy to the new
        // root (via the re-homed node update), so this tombstone must NOT touch
        // it — the root_id no longer matches and the delete is a no-op. If the
        // tombstone happens to arrive first, this deletes the stale copy and the
        // re-homed update recreates it under the new root; the outcome is the
        // same either way, so the two synchronizers can race safely.
        const deletedNode = await trx
          .deleteFrom('nodes')
          .returningAll()
          .where('id', '=', tombstone.id)
          .where('root_id', '=', tombstone.rootId)
          .executeTakeFirst();

        if (!deletedNode) {
          return { deletedNode: undefined, deletedCollaborations: [] };
        }

        const deletedCollaborations = await trx
          .deleteFrom('collaborations')
          .where('node_id', '=', tombstone.id)
          .returningAll()
          .execute();

        await deleteNodeRelations(trx, tombstone.id);

        return { deletedNode, deletedCollaborations };
      });

    if (!deletedNode) {
      return;
    }

    await this.workspace.nodeCounters.checkCountersForDeletedNode(deletedNode);

    if (deletedNode.type === 'file') {
      await this.workspace.files.deleteFile(deletedNode);

      const deletedUpload = await this.workspace.database
        .deleteFrom('uploads')
        .where('file_id', '=', deletedNode.id)
        .returningAll()
        .executeTakeFirst();

      if (deletedUpload) {
        eventBus.publish({
          type: 'upload.deleted',
          workspace: {
            workspaceId: this.workspace.workspaceId,
            userId: this.workspace.userId,
            accountId: this.workspace.accountId,
          },
          upload: mapUpload(deletedUpload),
        });
      }

      const updatedDownloads = await this.workspace.database
        .updateTable('downloads')
        .set({
          status: DownloadStatus.Failed,
          error_code: 'file_deleted',
          error_message: 'File has been deleted',
        })
        .where('file_id', '=', deletedNode.id)
        .where('status', 'in', [
          DownloadStatus.Pending,
          DownloadStatus.Downloading,
        ])
        .returningAll()
        .execute();

      if (updatedDownloads.length > 0) {
        for (const updatedDownload of updatedDownloads) {
          eventBus.publish({
            type: 'download.updated',
            workspace: {
              workspaceId: this.workspace.workspaceId,
              userId: this.workspace.userId,
              accountId: this.workspace.accountId,
            },
            download: mapDownload(updatedDownload),
          });
        }
      }
    }

    eventBus.publish({
      type: 'node.deleted',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      node: mapNode(deletedNode),
    });

    for (const deletedCollaboration of deletedCollaborations) {
      eventBus.publish({
        type: 'collaboration.deleted',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeId: deletedCollaboration.node_id,
      });
    }
  }

  public async revertNodeCreate(mutation: CreateNodeMutationData) {
    const { deletedNode, deletedCollaborations } = await this.workspace.database
      .transaction()
      .execute(async (tx) => {
        const deletedNode = await tx
          .deleteFrom('nodes')
          .where('id', '=', mutation.nodeId)
          .returningAll()
          .executeTakeFirst();

        const deletedCollaborations = await tx
          .deleteFrom('collaborations')
          .where('node_id', '=', mutation.nodeId)
          .returningAll()
          .execute();

        await deleteNodeRelations(tx, mutation.nodeId);

        return { deletedNode, deletedCollaborations };
      });

    if (!deletedNode) {
      return;
    }

    if (deletedNode.type === 'file') {
      this.workspace.files.deleteFile(deletedNode);
    }

    eventBus.publish({
      type: 'node.deleted',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      node: mapNode(deletedNode),
    });

    for (const deletedCollaboration of deletedCollaborations) {
      eventBus.publish({
        type: 'collaboration.deleted',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        nodeId: deletedCollaboration.node_id,
      });
    }
  }

  public async revertNodeUpdate(mutation: UpdateNodeMutationData) {
    for (let count = 0; count < UPDATE_RETRIES_LIMIT; count++) {
      const result = await this.tryRevertNodeUpdate(mutation);

      if (result) {
        return;
      }
    }
  }

  private async tryRevertNodeUpdate(
    mutation: UpdateNodeMutationData
  ): Promise<boolean> {
    const node = await this.workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', mutation.nodeId)
      .executeTakeFirst();

    if (!node) {
      await deleteNodeRelations(this.workspace.database, mutation.nodeId);
      return true;
    }

    const updateRow = await this.workspace.database
      .selectFrom('node_updates')
      .selectAll()
      .where('id', '=', mutation.updateId)
      .executeTakeFirst();

    if (!updateRow) {
      return true;
    }

    const nodeUpdates = await this.workspace.database
      .selectFrom('node_updates')
      .selectAll()
      .where('node_id', '=', mutation.nodeId)
      .orderBy('id', 'asc')
      .execute();

    const state = await this.workspace.database
      .selectFrom('node_states')
      .selectAll()
      .where('id', '=', mutation.nodeId)
      .executeTakeFirst();

    const ydoc = new YDoc(state?.state);
    for (const nodeUpdate of nodeUpdates) {
      if (nodeUpdate.id === mutation.updateId) {
        continue;
      }

      if (nodeUpdate.data) {
        ydoc.applyUpdate(nodeUpdate.data);
      }
    }

    const attributes = ydoc.getObject<NodeAttributes>();
    const model = getNodeModel(attributes.type);
    const nodeText = model.extractText(node.id, attributes);
    const localRevision = BigInt(node.local_revision) + BigInt(1);

    const beforeAttributes = JSON.parse(node.attributes);
    const beforeMentions = model.extractMentions(node.id, beforeAttributes);
    const afterMentions = model.extractMentions(node.id, attributes);
    const mentionChanges = checkMentionChanges(beforeMentions, afterMentions);

    const { updatedNode, createdNodeReferences, deletedNodeReferences } =
      await this.workspace.database.transaction().execute(async (trx) => {
        const updatedNode = await trx
          .updateTable('nodes')
          .returningAll()
          .set({
            attributes: JSON.stringify(attributes),
            local_revision: localRevision.toString(),
          })
          .where('id', '=', mutation.nodeId)
          .where('local_revision', '=', node.local_revision)
          .executeTakeFirst();

        if (!updatedNode) {
          throw new Error('Failed to update node');
        }

        await trx
          .deleteFrom('node_updates')
          .where('id', '=', mutation.updateId)
          .execute();

        if (nodeText) {
          await trx
            .deleteFrom('node_texts')
            .where('id', '=', node.id)
            .execute();

          await trx
            .insertInto('node_texts')
            .values({
              id: node.id,
              name: nodeText.name,
              attributes: nodeText.attributes,
            })
            .execute();
        }

        const { createdNodeReferences, deletedNodeReferences } =
          await applyMentionUpdates(
            trx,
            node.id,
            this.workspace.userId,
            mutation.createdAt,
            mentionChanges
          );

        return { updatedNode, createdNodeReferences, deletedNodeReferences };
      });

    if (updatedNode) {
      eventBus.publish({
        type: 'node.updated',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        node: mapNode(updatedNode),
      });

      for (const createdNodeReference of createdNodeReferences) {
        eventBus.publish({
          type: 'node.reference.created',
          workspace: {
            workspaceId: this.workspace.workspaceId,
            userId: this.workspace.userId,
            accountId: this.workspace.accountId,
          },
          nodeReference: mapNodeReference(createdNodeReference),
        });
      }

      for (const deletedNodeReference of deletedNodeReferences) {
        eventBus.publish({
          type: 'node.reference.deleted',
          workspace: {
            workspaceId: this.workspace.workspaceId,
            userId: this.workspace.userId,
            accountId: this.workspace.accountId,
          },
          nodeReference: mapNodeReference(deletedNodeReference),
        });
      }

      return true;
    }

    return false;
  }

  public async revertNodeDelete(mutation: DeleteNodeMutationData) {
    const tombstone = await this.workspace.database
      .selectFrom('tombstones')
      .selectAll()
      .where('id', '=', mutation.nodeId)
      .executeTakeFirst();

    if (!tombstone) {
      return;
    }

    const state = await this.workspace.database
      .selectFrom('node_states')
      .selectAll()
      .where('id', '=', mutation.nodeId)
      .executeTakeFirst();

    const nodeUpdates = await this.workspace.database
      .selectFrom('node_updates')
      .selectAll()
      .where('node_id', '=', mutation.nodeId)
      .orderBy('id', 'asc')
      .execute();

    const ydoc = new YDoc(state?.state);
    for (const nodeUpdate of nodeUpdates) {
      ydoc.applyUpdate(nodeUpdate.data);
    }

    const attributes = ydoc.getObject<NodeAttributes>();
    const deletedNode = JSON.parse(tombstone.data) as SelectNode;

    const createdNode = await this.workspace.database
      .transaction()
      .execute(async (trx) => {
        const createdNode = await trx
          .insertInto('nodes')
          .returningAll()
          .values({
            id: deletedNode.id,
            root_id: deletedNode.root_id,
            created_at: deletedNode.created_at,
            created_by: deletedNode.created_by,
            attributes: JSON.stringify(attributes),
            updated_at: deletedNode.updated_at,
            updated_by: deletedNode.updated_by,
            local_revision: deletedNode.local_revision,
            server_revision: deletedNode.server_revision,
          })
          .onConflict((b) => b.doNothing())
          .executeTakeFirst();

        if (!createdNode) {
          return undefined;
        }

        await trx
          .deleteFrom('tombstones')
          .where('id', '=', mutation.nodeId)
          .execute();
      });

    if (createdNode) {
      eventBus.publish({
        type: 'node.created',
        workspace: {
          workspaceId: this.workspace.workspaceId,
          userId: this.workspace.userId,
          accountId: this.workspace.accountId,
        },
        node: mapNode(createdNode),
      });

      return true;
    }

    return false;
  }
}
