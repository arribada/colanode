// ABOUTME: Key context for an inline record mention (its project + short id such as
// ABOUTME: "ADR-2"), so per-project numbered records are not ambiguous when mentioned.
import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';

export type RecordMentionContext = {
  // Short id from the start of the record name, leading zeros stripped
  // ("ADR-002: Energy budget" -> "ADR-2"); null when the name has none.
  key: string | null;
  // Option name of the record's "Project" select; null when there is none.
  context: string | null;
};

type RecordLike = Pick<LocalRecordNode, 'name' | 'fields'>;
type DatabaseLike = Pick<LocalDatabaseNode, 'fields'>;

const RECORD_KEY = /^([A-Z][A-Z0-9]*)-(\d+)/;
const PROJECT_FIELD_NAME = /\bproject\b/i;
const SEPARATOR = ' · ';

export const getRecordMentionKey = (name: string | null | undefined) => {
  const match = RECORD_KEY.exec((name ?? '').trim());
  if (!match) {
    return null;
  }
  const digits = match[2]!.replace(/^0+(?=\d)/, '');
  return `${match[1]}-${digits}`;
};

// The first "project" select field (in the database's field order) whose value
// on this record resolves to a live option name. A value pointing at an option
// that no longer exists is skipped rather than shown as a raw id.
const getRecordMentionProject = (
  record: RecordLike,
  database: DatabaseLike | null | undefined
) => {
  const fields = Object.values(database?.fields ?? {})
    .filter((field) => field.type === 'select')
    .filter((field) => PROJECT_FIELD_NAME.test(field.name))
    .sort((a, b) => (a.index ?? '').localeCompare(b.index ?? ''));

  for (const field of fields) {
    if (field.type !== 'select') {
      continue;
    }
    const value = record.fields?.[field.id];
    if (!value || value.type !== 'string' || value.value.length === 0) {
      continue;
    }
    const optionName = field.options?.[value.value]?.name?.trim();
    if (optionName) {
      return optionName;
    }
  }

  return null;
};

export const getRecordMentionContext = (
  record: RecordLike,
  database: DatabaseLike | null | undefined
): RecordMentionContext => ({
  key: getRecordMentionKey(record.name),
  context: getRecordMentionProject(record, database),
});

// The short chip text ("🐢 Sea Turtle Tag — Doppler (SMD) · ADR-2"), or null
// when the record has neither a project nor a key (render the name as before).
export const formatRecordMentionChip = (
  ctx: RecordMentionContext
): string | null => {
  const parts = [ctx.context, ctx.key].filter(
    (part): part is string => part !== null && part.length > 0
  );
  return parts.length > 0 ? parts.join(SEPARATOR) : null;
};

// The full, unambiguous label: the project in front of the full record name
// (the name already carries the key). Used for tooltips and pickers.
export const formatRecordMentionLabel = (
  name: string,
  ctx: RecordMentionContext
): string => (ctx.context ? `${ctx.context}${SEPARATOR}${name}` : name);
