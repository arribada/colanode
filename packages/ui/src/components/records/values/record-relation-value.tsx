import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

import { mapNodeAttributes } from '@colanode/client/lib';
import { LocalRecordNode } from '@colanode/client/types';
import { RelationFieldAttributes, StringArrayFieldValue } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { RecordSearch } from '@colanode/ui/components/records/record-search';
import { Badge } from '@colanode/ui/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Separator } from '@colanode/ui/components/ui/separator';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordField } from '@colanode/ui/hooks/use-record-field';

interface RecordRelationValueProps {
  field: RelationFieldAttributes;
  readOnly?: boolean;
}

const RelationBadge = ({ record }: { record: LocalRecordNode }) => {
  const name = record.name ?? 'Unnamed';
  return (
    <div className="flex flex-row items-center gap-1">
      <Avatar id={record.id} name={name} avatar={record.avatar} size="small" />
      <p className="text-sm line-clamp-1 w-full">{name}</p>
    </div>
  );
};

export const RecordRelationValue = ({
  field,
  readOnly,
}: RecordRelationValueProps) => {
  const workspace = useWorkspace();
  const record = useRecord();
  const { value, setValue, clearValue } = useRecordField<StringArrayFieldValue>(
    {
      field,
    }
  );

  // Bidirectional sync: when this relation is linked to a field on the target
  // database (field.relatedFieldId), mirror every add/remove onto the target
  // record's own relation value. Guarded to be idempotent so the mirroring
  // write on the other side does not bounce back (it finds the id already
  // present/absent and skips the write).
  // Compute the target's next reverse-relation string_array after adding or
  // removing this record's id. Returns null when the value is already in the
  // desired state (idempotent -> the mirroring write is skipped, so a bounce
  // from the other side finds nothing to do and stops).
  const nextReverseValue = (
    current: string[],
    add: boolean
  ): string[] | null => {
    const has = current.includes(record.id);
    if (add) {
      if (has) return null;
      return [...current, record.id];
    }
    if (!has) return null;
    return current.filter((id) => id !== record.id);
  };

  // Read the target record's current reverse-relation ids off a full node
  // object (its attributes are flattened onto the node, so node.fields is the
  // record's field map).
  const readReverseIds = (
    node: LocalRecordNode,
    relatedFieldId: string
  ): string[] => {
    const existing = node.fields[relatedFieldId];
    return existing && existing.type === 'string_array' ? existing.value : [];
  };

  const mirrorRelation = (
    targetRecordId: string,
    add: boolean,
    // The caller always has the full target node in hand (RecordSearch.onSelect
    // passes the selected LocalRecordNode; the X-remove path passes the loaded
    // relation row). We use it to persist the reverse side even when the target
    // is NOT in the on-demand nodes collection.
    targetRecord?: LocalRecordNode
  ) => {
    const relatedFieldId = field.relatedFieldId;
    if (!relatedFieldId) return;

    // Fast path: the target IS loaded -> optimistically patch the collection so
    // an open view of the other database reflects the change immediately. This
    // is the previous behaviour and stays idempotent.
    if (workspace.collections.nodes.has(targetRecordId)) {
      workspace.collections.nodes.update(targetRecordId, (draft) => {
        if (draft.type !== 'record') return;
        const existing = draft.fields[relatedFieldId];
        const current =
          existing && existing.type === 'string_array' ? existing.value : [];
        const next = nextReverseValue(current, add);
        if (next === null) return;
        if (next.length === 0) {
          const { [relatedFieldId]: _removed, ...rest } = draft.fields;
          draft.fields = rest;
        } else {
          draft.fields[relatedFieldId] = {
            type: 'string_array',
            value: next,
          };
        }
      });
      return;
    }

    // Slow path: the target database is not open, so the record is absent from
    // the nodes collection (collection.update would throw UpdateKeyNotFoundError
    // on an unknown key). Instead persist the reverse side authoritatively via a
    // node.update mutation built from the full target node we already hold.
    // node.update does a CRDT read-modify-write against the live node state and
    // re-checks canUpdateAttributes, so this merges cleanly and is skipped
    // server- and client-side if the user cannot edit the target.
    if (!targetRecord || targetRecord.type !== 'record') return;

    // Per-record lock mirrors the value-editor rule: a locked target may only be
    // mirrored into by its creator; skip otherwise (the server would reject it
    // too). General role checks are enforced authoritatively by node.update.
    const lockMode = targetRecord.lockMode ?? 'open';
    if (lockMode === 'locked' && targetRecord.createdBy !== workspace.userId) {
      return;
    }

    const current = readReverseIds(targetRecord, relatedFieldId);
    const next = nextReverseValue(current, add);
    if (next === null) return; // already in the desired state -> no-op.

    const attributes = mapNodeAttributes(targetRecord);
    if (attributes.type !== 'record') return;
    if (next.length === 0) {
      const { [relatedFieldId]: _removed, ...restFields } = attributes.fields;
      attributes.fields = restFields;
    } else {
      attributes.fields = {
        ...attributes.fields,
        [relatedFieldId]: { type: 'string_array', value: next },
      };
    }

    window.colanode
      .executeMutation({
        type: 'node.update',
        userId: workspace.userId,
        nodeId: targetRecordId,
        attributes,
      })
      .catch(() => {
        // Best-effort mirror: a failed reverse write must never break the
        // primary relation edit the user just made.
      });
  };

  const [open, setOpen] = useState(false);

  const relationIds = useMemo(() => value?.value ?? [], [value]);
  const relationsQuery = useLiveQuery(
    (q) => {
      if (relationIds.length === 0 || !field.databaseId) {
        return q
          .from({ nodes: workspace.collections.nodes })
          .where(({ nodes }) => eq(nodes.id, '')); // Return empty result
      }

      return q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.id, relationIds));
    },
    [workspace.userId, field.databaseId, relationIds]
  );

  const relations = relationsQuery.data.map((node) => node as LocalRecordNode);
  if (!field.databaseId) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={field.name}
          className="flex h-full w-full cursor-pointer flex-wrap gap-1 p-0 overflow-hidden text-left"
        >
          {relations.slice(0, 1).map((relation) => (
            <RelationBadge key={relation.id} record={relation} />
          ))}
          {relations.length === 0 && ' '}
          {relations.length > 1 && (
            <Badge
              variant="outline"
              className="ml-2 text-xs px-1 text-muted-foreground"
            >
              +{relations.length - 1}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1">
        <div className="flex flex-col flex-wrap gap-2 p-2">
          {relations.length > 0 ? (
            <Fragment>
              {relations.map((relation) => (
                <div
                  key={relation.id}
                  data-testid={`record-relation-row-${relation.id}`}
                  className="flex w-full flex-row items-center gap-2"
                >
                  <RelationBadge record={relation} />
                  {record.canEdit && !readOnly && (
                    <button
                      type="button"
                      aria-label="Remove relation"
                      data-testid={`record-relation-remove-${relation.id}`}
                      className="cursor-pointer"
                      onClick={() => {
                        if (!record.canEdit || readOnly) return;

                        const newRelations = relationIds.filter(
                          (id) => id !== relation.id
                        );

                        if (newRelations.length === 0) {
                          clearValue();
                        } else {
                          setValue({
                            type: 'string_array',
                            value: newRelations,
                          });
                        }

                        mirrorRelation(relation.id, false, relation);
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <Separator className="w-full my-2" />
            </Fragment>
          ) : (
            <p className="text-sm text-muted-foreground">No relations</p>
          )}
        </div>
        {record.canEdit && !readOnly && (
          <RecordSearch
            databaseId={field.databaseId}
            exclude={relationIds}
            onSelect={(selectedRecord) => {
              if (!record.canEdit || readOnly) return;

              const wasSelected = relationIds.includes(selectedRecord.id);
              const newRelations = wasSelected
                ? relationIds.filter((id) => id !== selectedRecord.id)
                : [...relationIds, selectedRecord.id];

              if (newRelations.length === 0) {
                clearValue();
              } else {
                setValue({
                  type: 'string_array',
                  value: newRelations,
                });
              }

              mirrorRelation(selectedRecord.id, !wasSelected, selectedRecord);

              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};
