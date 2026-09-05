import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

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
  const mirrorRelation = (targetRecordId: string, add: boolean) => {
    const relatedFieldId = field.relatedFieldId;
    if (!relatedFieldId) return;
    // The target record is often NOT loaded in the on-demand nodes collection
    // (a relation into an un-opened database; RecordSearch reads SQLite
    // directly). collection.update THROWS UpdateKeyNotFoundError on an unknown
    // key, which previously crashed the value editor mid-link. Guard: this
    // optimistic mirror only reflects already-loaded target records; robust
    // cross-database sync is handled authoritatively server-side.
    if (!workspace.collections.nodes.has(targetRecordId)) return;
    workspace.collections.nodes.update(targetRecordId, (draft) => {
      if (draft.type !== 'record') return;
      const existing = draft.fields[relatedFieldId];
      const current =
        existing && existing.type === 'string_array' ? existing.value : [];
      const has = current.includes(record.id);
      if (add) {
        if (has) return;
        draft.fields[relatedFieldId] = {
          type: 'string_array',
          value: [...current, record.id],
        };
      } else {
        if (!has) return;
        const next = current.filter((id) => id !== record.id);
        if (next.length === 0) {
          const { [relatedFieldId]: _removed, ...rest } = draft.fields;
          draft.fields = rest;
        } else {
          draft.fields[relatedFieldId] = {
            type: 'string_array',
            value: next,
          };
        }
      }
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

                        mirrorRelation(relation.id, false);
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

              mirrorRelation(selectedRecord.id, !wasSelected);

              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};
