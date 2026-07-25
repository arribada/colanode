import { coalesce, eq, inArray, Ref, useLiveQuery } from '@tanstack/react-db';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Link } from '@colanode/ui/components/ui/link';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

// A relation field (in some database) whose target is THIS record's database,
// i.e. a potential back-reference into the current record.
interface ReverseSource {
  databaseId: string;
  databaseName: string;
  fieldId: string;
  fieldName: string;
}

// Reverse relations: enumerate every relation field, in any database, whose
// databaseId targets the current record's database, then list the records that
// actually point back at this record. Read-only, purely client-side.
export const RecordLinkedReferences = () => {
  const workspace = useWorkspace();
  const record = useRecord();

  const dbQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'database')),
    [workspace.userId]
  );

  const databases = (dbQuery.data ?? []) as unknown as LocalDatabaseNode[];

  const sources: ReverseSource[] = databases.flatMap((db) =>
    Object.values(db.fields ?? {})
      .filter(
        (field) =>
          field.type === 'relation' && field.databaseId === record.databaseId
      )
      .map((field) => ({
        databaseId: db.id,
        databaseName: db.name ?? 'Untitled',
        fieldId: field.id,
        fieldName: field.name,
      }))
  );

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-3">
      <p className="text-sm font-semibold text-muted-foreground">
        Linked records
      </p>
      {sources.map((source) => (
        <LinkedGroup
          key={`${source.databaseId}.${source.fieldId}`}
          source={source}
          recordId={record.id}
        />
      ))}
    </div>
  );
};

const LinkedGroup = ({
  source,
  recordId,
}: {
  source: ReverseSource;
  recordId: string;
}) => {
  const workspace = useWorkspace();

  const query = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'record'))
        .where(({ nodes }) =>
          eq((nodes as unknown as LocalRecordNode).databaseId, source.databaseId)
        )
        .where(({ nodes }) => {
          const value = (nodes as unknown as Ref<LocalRecordNode>).fields[
            source.fieldId
          ]?.value as unknown as string[] | undefined;
          return inArray(recordId, coalesce(value, [] as string[]));
        }),
    [workspace.userId, source.databaseId, source.fieldId, recordId]
  );

  const records = (query.data ?? []) as unknown as LocalRecordNode[];

  if (records.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        {source.databaseName} · {source.fieldName}
      </p>
      <div className="flex flex-wrap gap-2">
        {records.map((related) => (
          <Link
            key={related.id}
            from="/workspace/$userId"
            to="$nodeId"
            params={{ nodeId: related.id }}
            className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm hover:bg-accent"
          >
            <Avatar
              size="small"
              id={related.id}
              name={related.name ?? 'Unnamed'}
              avatar={related.avatar}
            />
            <span>{related.name ?? 'Unnamed'}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};
