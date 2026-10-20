// ABOUTME: Matches a database's records against the words typed in a view's search
// ABOUTME: box: every word must appear in the record's name or in one of its values.
import { FieldAttributes } from '@colanode/core';

export interface SearchableRecord {
  id: string;
  name: string;
  fields: Record<string, { value?: unknown } | undefined>;
  createdBy?: string | null;
  updatedBy?: string | null;
}

// Records only store ids for people and linked records; the search reads the
// names a reader sees in their place.
export interface RecordSearchLookups {
  userName: (userId: string) => string | undefined;
  recordName: (recordId: string) => string | undefined;
}

// Case and accents never decide a match: "eclosion" finds "Éclosion".
export const foldSearchText = (value: string): string =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const parseSearchWords = (query: string): string[] =>
  foldSearchText(query).split(/\s+/).filter(Boolean);

const asStrings = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return [value];
  }
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};

// The record as plain text: its name, then what each field shows -- an option's
// name rather than its id, a person's name rather than their user id. Dates are
// left out: typing "10" would otherwise find every record dated in October.
export const recordSearchText = (
  record: SearchableRecord,
  fields: FieldAttributes[],
  lookups: RecordSearchLookups
): string => {
  const parts: string[] = [record.name ?? ''];
  const push = (text: string | null | undefined) => {
    if (text) {
      parts.push(text);
    }
  };

  for (const field of fields) {
    const value = record.fields[field.id]?.value;
    switch (field.type) {
      case 'text':
      case 'email':
      case 'url':
      case 'phone':
        push(typeof value === 'string' ? value : undefined);
        break;
      case 'number':
      case 'rating':
        push(typeof value === 'number' ? String(value) : undefined);
        break;
      case 'formula':
        push(
          typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : undefined
        );
        break;
      case 'select':
      case 'multi_select':
        for (const optionId of asStrings(value)) {
          push(field.options?.[optionId]?.name);
        }
        break;
      case 'collaborator':
        for (const userId of asStrings(value)) {
          push(lookups.userName(userId));
        }
        break;
      case 'created_by':
        push(record.createdBy ? lookups.userName(record.createdBy) : undefined);
        break;
      case 'updated_by':
        push(record.updatedBy ? lookups.userName(record.updatedBy) : undefined);
        break;
      case 'relation':
        for (const recordId of asStrings(value)) {
          push(lookups.recordName(recordId));
        }
        break;
      default:
        break;
    }
  }

  return foldSearchText(parts.join('\n'));
};

// Ids of the records containing every typed word, in any order and any field,
// so "spot done" finds a SPOT task whose status is Done. Null when nothing is
// typed: the view is then not narrowed at all.
export const matchRecordIds = (
  records: SearchableRecord[],
  fields: FieldAttributes[],
  query: string,
  lookups: RecordSearchLookups
): string[] | null => {
  const words = parseSearchWords(query);
  if (words.length === 0) {
    return null;
  }

  return records
    .filter((record) => {
      const text = recordSearchText(record, fields, lookups);
      return words.every((word) => text.includes(word));
    })
    .map((record) => record.id);
};

export const sameIds = (
  a: readonly string[] | null,
  b: readonly string[] | null
): boolean => {
  if (a === null || b === null) {
    return a === b;
  }
  return a.length === b.length && a.every((id, index) => id === b[index]);
};
