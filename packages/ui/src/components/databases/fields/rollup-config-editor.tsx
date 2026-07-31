// Reusable editor for a rollup field: pick the relation field, the target
// field on the related database and the aggregation applied client-side.

import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';

import { LocalDatabaseNode } from '@colanode/client/types';
import {
  FieldAttributes,
  RelationFieldAttributes,
  RollupAggregation,
} from '@colanode/core';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { Label } from '@colanode/ui/components/ui/label';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface RollupConfigEditorProps {
  fields: FieldAttributes[];
  relationFieldId: string | null;
  onRelationFieldChange: (fieldId: string) => void;
  targetFieldId: string | null;
  onTargetFieldChange: (fieldId: string) => void;
  aggregation: RollupAggregation | null;
  onAggregationChange: (aggregation: RollupAggregation) => void;
}

const AGGREGATIONS: { label: string; value: RollupAggregation }[] = [
  { label: 'Count', value: 'count' },
  { label: 'Sum', value: 'sum' },
  { label: 'Average', value: 'average' },
  { label: 'Min', value: 'min' },
  { label: 'Max', value: 'max' },
  { label: 'Earliest', value: 'earliest' },
  { label: 'Latest', value: 'latest' },
  { label: 'Percent checked', value: 'percent_checked' },
  { label: 'Show original', value: 'show_original' },
];

export const RollupConfigEditor = ({
  fields,
  relationFieldId,
  onRelationFieldChange,
  targetFieldId,
  onTargetFieldChange,
  aggregation,
  onAggregationChange,
}: RollupConfigEditorProps) => {
  const workspace = useWorkspace();

  const relationFields = useMemo(
    () =>
      fields.filter(
        (field): field is RelationFieldAttributes => field.type === 'relation'
      ),
    [fields]
  );

  const relationField = relationFieldId
    ? relationFields.find((field) => field.id === relationFieldId)
    : undefined;

  const relatedDatabaseId = relationField?.databaseId ?? null;

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

  const relatedDatabase = relatedDatabaseQuery.data[0] as
    | LocalDatabaseNode
    | undefined;

  const targetFields = relatedDatabase
    ? Object.values(relatedDatabase.fields)
    : [];

  const needsTarget = aggregation !== null && aggregation !== 'count';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Relation</Label>
        {relationFields.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add a relation field to this database first.
          </p>
        ) : (
          <FieldSelect
            fields={relationFields}
            value={relationFieldId}
            onChange={onRelationFieldChange}
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Aggregation</Label>
        <div className="flex flex-row flex-wrap gap-1">
          {AGGREGATIONS.map((option) => {
            const isSelected = option.value === aggregation;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onAggregationChange(option.value)}
                className={cn(
                  'rounded-sm border px-2 py-1 text-xs',
                  isSelected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-input text-muted-foreground hover:bg-accent'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {needsTarget && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Field to aggregate</Label>
          {!relationField ? (
            <p className="text-xs text-muted-foreground">
              Select a relation first.
            </p>
          ) : targetFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No fields found on the related database.
            </p>
          ) : (
            <FieldSelect
              fields={targetFields}
              value={targetFieldId}
              onChange={onTargetFieldChange}
            />
          )}
        </div>
      )}
    </div>
  );
};
