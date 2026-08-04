// ABOUTME: Shared ids + status->color logic for the 🧭 ADR database, imported by
// ABOUTME: the /create adr command and the mention status pastille alike.
import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import { SelectFieldAttributes, SelectOptionAttributes } from '@colanode/core';

// The 🧭 ADR database node id (in the "📚 Reference & Workspace" space). A record
// whose databaseId equals this is an ADR. Resolved by id first, then by name.
export const ADR_DATABASE_ID = '01kz65zq0tcwrjsry61cw4sf4pdb';

// Field ids, correct as of the database's creation. Runtime resolution by
// name/type is preferred; these are the fallback when a field can't be found.
export const ADR_STATUS_FIELD_ID = '01kz65zq0tcwrjsry61cw4sf4qfd';
export const ADR_OWNER_FIELD_ID = '01kz65zq0tcwrjsry61cw4sf4sfd';

// Status option ids, correct as of creation (fallback only).
export const ADR_STATUS_OPEN_OPTION_ID = '01kz65zq0rpezwta1wt5sne2v9so';
export const ADR_STATUS_IN_REFLECTION_OPTION_ID =
  '01kz65zq0snsrbjav99ak8trgaso';
export const ADR_STATUS_RESOLVED_OPTION_ID = '01kz65zq0snsrbjav99ak8trgbso';

export type AdrStatusColor = 'red' | 'amber' | 'green';

// Used only when the live option can't be resolved from the DB (e.g. the DB
// node hasn't loaded yet). The known ids are correct, so this stays accurate.
export const ADR_STATUS_OPTION_COLOR_FALLBACK: Record<string, AdrStatusColor> = {
  [ADR_STATUS_OPEN_OPTION_ID]: 'red',
  [ADR_STATUS_IN_REFLECTION_OPTION_ID]: 'amber',
  [ADR_STATUS_RESOLVED_OPTION_ID]: 'green',
};

// Full, static Tailwind text-color literals (so the scanner emits them) for the
// ● pastille rendered before an ADR mention.
export const ADR_STATUS_DOT_CLASS: Record<AdrStatusColor, string> = {
  red: 'text-red-500',
  amber: 'text-amber-500',
  green: 'text-green-500',
};

// Maps a status option NAME to a semantic color bucket, so renamed or added
// statuses still color correctly: unresolved/open -> red, in-progress/
// reflection -> amber, resolved/closed/done -> green.
export const mapAdrStatusNameToColor = (
  name: string
): AdrStatusColor | null => {
  const value = name.trim().toLowerCase();
  if (value.length === 0) {
    return null;
  }
  if (/resolv|closed|done|complete|accepted|approved|final|ship/.test(value)) {
    return 'green';
  }
  if (/reflect|progress|review|pending|discuss|consider|wip|draft/.test(value)) {
    return 'amber';
  }
  if (/open|unresolved|new|todo|to.?do|backlog|propos|blocked/.test(value)) {
    return 'red';
  }
  return null;
};

// Maps an option's stored color VALUE (as set on the select option) to a bucket.
const mapAdrColorValueToColor = (color: string): AdrStatusColor | null => {
  const value = color.trim().toLowerCase();
  if (value === 'red' || value === 'pink' || value === 'rose') {
    return 'red';
  }
  if (value === 'orange' || value === 'amber' || value === 'yellow') {
    return 'amber';
  }
  if (
    value === 'green' ||
    value === 'emerald' ||
    value === 'lime' ||
    value === 'teal'
  ) {
    return 'green';
  }
  return null;
};

const sortOptionsByIndex = (
  options: Record<string, SelectOptionAttributes> | undefined
): SelectOptionAttributes[] =>
  Object.values(options ?? {}).sort((a, b) => a.index.localeCompare(b.index));

// The ADR database's Status select field, resolved by name (then the first
// select field) from the live DB node; null when the DB isn't available.
export const resolveAdrStatusField = (
  adrDb: LocalDatabaseNode | null
): SelectFieldAttributes | null => {
  const fields = Object.values(adrDb?.fields ?? {});
  return (
    fields.find(
      (field): field is SelectFieldAttributes =>
        field.type === 'select' && field.name.toLowerCase().includes('status')
    ) ??
    fields.find(
      (field): field is SelectFieldAttributes => field.type === 'select'
    ) ??
    null
  );
};

// The "Open" status option id, resolved by name from the live DB (fallback: the
// first option, then the known id).
export const resolveAdrOpenStatusOptionId = (
  adrDb: LocalDatabaseNode | null
): string => {
  const statusField = resolveAdrStatusField(adrDb);
  if (!statusField) {
    return ADR_STATUS_OPEN_OPTION_ID;
  }
  const options = sortOptionsByIndex(statusField.options);
  const open =
    options.find((option) => /^(open|unresolved)$/i.test(option.name.trim())) ??
    options.find((option) => /open|unresolved/i.test(option.name)) ??
    options[0] ??
    null;
  return open?.id ?? ADR_STATUS_OPEN_OPTION_ID;
};

// The color of a record's current Status, resolved from the live DB options (by
// option NAME, then the option's stored color, then the known-id fallback).
export const resolveAdrStatusColor = (
  record: LocalRecordNode,
  adrDb: LocalDatabaseNode | null
): AdrStatusColor | null => {
  const statusField = resolveAdrStatusField(adrDb);
  const statusFieldId = statusField?.id ?? ADR_STATUS_FIELD_ID;
  const value = record.fields[statusFieldId];
  const optionId = value != null && value.type === 'string' ? value.value : null;
  if (!optionId) {
    return null;
  }

  const option = statusField?.options?.[optionId] ?? null;
  if (option) {
    return (
      mapAdrStatusNameToColor(option.name) ??
      mapAdrColorValueToColor(option.color) ??
      ADR_STATUS_OPTION_COLOR_FALLBACK[optionId] ??
      null
    );
  }

  return ADR_STATUS_OPTION_COLOR_FALLBACK[optionId] ?? null;
};
