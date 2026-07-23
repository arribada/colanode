// Read-only cell that resolves a record's related records for a rollup field
// and renders the client-side aggregated value.

import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';

import { evaluateRollup, formatRollupValue } from '@colanode/client/lib';
import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import { RollupFieldAttributes } from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface RecordRollupValueProps {
  field: RollupFieldAttributes;
}

export const RecordRollupValue = ({ field }: RecordRollupValueProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const record = useRecord();

  const relationField = field.relationFieldId
    ? database.fields.find((f) => f.id === field.relationFieldId)
    : undefined;

  const relationIds = useMemo(() => {
    if (!relationField) return [] as string[];
    const value = record.fields[relationField.id];
    return value && value.type === 'string_array' ? value.value : [];
  }, [record.fields, relationField]);

  const relatedDatabaseId =
    relationField && relationField.type === 'relation'
      ? (relationField.databaseId ?? null)
      : null;

  const relatedDatabaseQuery = useLiveQuery(
    (q) => {
      if (!relatedDatabaseId) {
        return q
          .from({ nodes: workspace.collections.nodes })
          .where(({ nodes }) => eq(nodes.id, ''));
      }
      return q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, relatedDatabaseId));
    },
    [workspace.userId, relatedDatabaseId]
  );

  const relationsQuery = useLiveQuery(
    (q) => {
      if (relationIds.length === 0) {
        return q
          .from({ nodes: workspace.collections.nodes })
          .where(({ nodes }) => inArray(nodes.id, ['']));
      }
      return q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.id, relationIds));
    },
    [workspace.userId, relationIds]
  );

  const relatedRecords = relationsQuery.data.map(
    (node) => node as LocalRecordNode
  );

  const relatedDatabase = relatedDatabaseQuery.data[0] as
    | LocalDatabaseNode
    | undefined;

  const targetField =
    relatedDatabase && field.targetFieldId
      ? relatedDatabase.fields[field.targetFieldId]
      : undefined;

  const aggregation = field.aggregation ?? 'count';

  const value = useMemo(
    () => evaluateRollup(aggregation, targetField, relatedRecords),
    [aggregation, targetField, relatedRecords]
  );

  if (!field.relationFieldId || !field.aggregation) {
    return (
      <p className="text-sm text-muted-foreground line-clamp-1 w-full">
        Not configured
      </p>
    );
  }

  const text = formatRollupValue(value, aggregation);
  return (
    <p
      aria-label={field.name}
      className="text-sm line-clamp-1 w-full text-muted-foreground"
      title={text}
    >
      {text}
    </p>
  );
};
