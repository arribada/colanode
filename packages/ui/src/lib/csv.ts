import { evaluateFormulaField, formatFormulaValue } from '@colanode/client/lib';
import { LocalRecordNode } from '@colanode/client/types';
import {
  compareString,
  FieldAttributes,
  FieldValue,
  generateFractionalIndex,
  SelectOptionAttributes,
} from '@colanode/core';

const CSV_DELIMITER_CANDIDATES = [',', ';', '\t'] as const;

export type CsvDelimiter = (typeof CSV_DELIMITER_CANDIDATES)[number];

const stripBom = (text: string): string => {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
};

export const detectCsvDelimiter = (text: string): CsvDelimiter => {
  const content = stripBom(text);
  const counts: Record<string, number> = {};
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          i++;
        } else {
          inQuotes = false;
        }
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === '\n' || char === '\r') {
      break;
    }

    if ((CSV_DELIMITER_CANDIDATES as readonly string[]).includes(char)) {
      counts[char] = (counts[char] ?? 0) + 1;
    }
  }

  let best: CsvDelimiter = ',';
  let bestCount = 0;
  for (const candidate of CSV_DELIMITER_CANDIDATES) {
    const count = counts[candidate] ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
};

export const parseCsv = (text: string, delimiter?: string): string[][] => {
  const content = stripBom(text);
  const delim = delimiter ?? detectCsvDelimiter(content);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }

        inQuotes = false;
        i++;
        continue;
      }

      cell += char;
      i++;
      continue;
    }

    if (char === '"' && cell.length === 0) {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === delim) {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') {
        i++;
      }

      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }

    cell += char;
    i++;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

const escapeCsvCell = (value: string, delimiter: string): string => {
  if (
    value.includes('"') ||
    value.includes(delimiter) ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
};

export const serializeCsv = (rows: string[][], delimiter = ','): string => {
  return rows
    .map((row) => row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter))
    .join('\r\n');
};

const CSV_EXPORTABLE_FIELD_TYPES = new Set<FieldAttributes['type']>([
  'boolean',
  'created_at',
  'date',
  'email',
  'formula',
  'multi_select',
  'number',
  'phone',
  'select',
  'text',
  'updated_at',
  'url',
]);

const CSV_IMPORTABLE_FIELD_TYPES = new Set<FieldAttributes['type']>([
  'boolean',
  'date',
  'email',
  'multi_select',
  'number',
  'phone',
  'select',
  'text',
  'url',
]);

export const isCsvExportableField = (field: FieldAttributes): boolean => {
  return CSV_EXPORTABLE_FIELD_TYPES.has(field.type);
};

export const isCsvImportableField = (field: FieldAttributes): boolean => {
  return CSV_IMPORTABLE_FIELD_TYPES.has(field.type);
};

export const serializeFieldValueToCsv = (
  record: LocalRecordNode,
  field: FieldAttributes,
  fields: FieldAttributes[]
): string => {
  if (field.type === 'created_at') {
    return record.createdAt ?? '';
  }

  if (field.type === 'updated_at') {
    return record.updatedAt ?? '';
  }

  // Formula fields store no value; compute it from the record's other fields
  // at export time using the same engine the RecordFormulaValue cell uses, so
  // the CSV matches what the app shows. (Rollup is intentionally not handled
  // here: it aggregates *related* records, which this pure serializer can't
  // load — see the export note.)
  if (field.type === 'formula') {
    const result = evaluateFormulaField(
      field,
      {
        fields: record.fields,
        name: record.name,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        createdBy: record.createdBy,
        updatedBy: record.updatedBy,
      },
      fields
    );
    return result.error ? '' : formatFormulaValue(result.value);
  }

  const value = record.fields[field.id];
  if (!value) {
    return '';
  }

  switch (field.type) {
    case 'text':
      return value.type === 'text' || value.type === 'string'
        ? value.value
        : '';
    case 'number':
      return value.type === 'number' ? String(value.value) : '';
    case 'boolean':
      return value.type === 'boolean' ? (value.value ? 'true' : 'false') : '';
    case 'date':
    case 'email':
    case 'phone':
    case 'url':
      return value.type === 'string' || value.type === 'text'
        ? value.value
        : '';
    case 'select': {
      if (value.type !== 'string') {
        return '';
      }

      return field.options?.[value.value]?.name ?? '';
    }
    case 'multi_select': {
      if (value.type !== 'string_array') {
        return '';
      }

      return value.value
        .map((optionId) => field.options?.[optionId]?.name)
        .filter((name): name is string => !!name)
        .join(', ');
    }
    default:
      return '';
  }
};

export interface CsvExportResult {
  csv: string;
  recordCount: number;
  includedFields: FieldAttributes[];
  skippedFields: FieldAttributes[];
}

export const exportRecordsToCsv = (
  records: LocalRecordNode[],
  fields: FieldAttributes[],
  nameHeader = 'Name'
): CsvExportResult => {
  const sortedFields = [...fields].sort((a, b) =>
    compareString(a.index, b.index)
  );

  const includedFields = sortedFields.filter(isCsvExportableField);
  const skippedFields = sortedFields.filter(
    (field) => !isCsvExportableField(field)
  );

  const header = [nameHeader, ...includedFields.map((field) => field.name)];
  const rows = records.map((record) => [
    record.name ?? '',
    ...includedFields.map((field) =>
      serializeFieldValueToCsv(record, field, sortedFields)
    ),
  ]);

  return {
    csv: serializeCsv([header, ...rows]),
    recordCount: records.length,
    includedFields,
    skippedFields,
  };
};

const CSV_TRUE_VALUES = new Set([
  'true',
  'yes',
  'y',
  '1',
  'x',
  'checked',
  'on',
]);

const CSV_FALSE_VALUES = new Set([
  'false',
  'no',
  'n',
  '0',
  'unchecked',
  'off',
]);

export const parseCsvBoolean = (raw: string): boolean | null => {
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (CSV_TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (CSV_FALSE_VALUES.has(normalized)) {
    return false;
  }

  return null;
};

export const parseCsvNumber = (raw: string): number | null => {
  let normalized = raw.trim().replace(/\s/g, '');
  if (normalized.length === 0) {
    return null;
  }

  const commaCount = (normalized.match(/,/g) ?? []).length;
  if (commaCount === 1 && !normalized.includes('.')) {
    // Treat a single comma without a dot as a decimal separator.
    normalized = normalized.replace(',', '.');
  } else {
    // Otherwise treat commas as thousands separators.
    normalized = normalized.replaceAll(',', '');
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

export const parseCsvDate = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    // Fall back to dd/mm/yyyy, which native parsing rejects.
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    date = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
  }

  return date.toISOString();
};

export const splitCsvMultiValues = (raw: string): string[] => {
  return raw
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export type CsvColumnTarget =
  | { type: 'skip' }
  | { type: 'name' }
  | { type: 'field'; fieldId: string }
  | { type: 'create-field'; fieldType: 'text' | 'select' };

export interface CsvImportIdGenerators {
  fieldId: () => string;
  selectOptionId: () => string;
  selectOptionColor: () => string;
}

export interface CsvImportRecord {
  name: string;
  fields: Record<string, FieldValue>;
}

export interface CsvImportPlan {
  newFields: FieldAttributes[];
  newOptions: Record<string, SelectOptionAttributes[]>;
  records: CsvImportRecord[];
}

interface ColumnPlan {
  columnIndex: number;
  kind: 'name' | 'field';
  field?: FieldAttributes;
  isNewField?: boolean;
}

export const buildCsvImportPlan = (
  headers: string[],
  rows: string[][],
  targets: CsvColumnTarget[],
  existingFields: FieldAttributes[],
  generators: CsvImportIdGenerators
): CsvImportPlan => {
  const newFields: FieldAttributes[] = [];
  const newOptions: Record<string, SelectOptionAttributes[]> = {};

  let lastFieldIndex = existingFields
    .map((field) => field.index)
    .sort(compareString)
    .at(-1);

  const columnPlans: ColumnPlan[] = [];
  for (let i = 0; i < headers.length; i++) {
    const target = targets[i];
    if (!target || target.type === 'skip') {
      continue;
    }

    if (target.type === 'name') {
      columnPlans.push({ columnIndex: i, kind: 'name' });
      continue;
    }

    if (target.type === 'field') {
      const field = existingFields.find((f) => f.id === target.fieldId);
      if (field && isCsvImportableField(field)) {
        columnPlans.push({ columnIndex: i, kind: 'field', field });
      }
      continue;
    }

    const index = generateFractionalIndex(lastFieldIndex, null);
    lastFieldIndex = index;

    const name = headers[i]?.trim() || `Column ${i + 1}`;
    const field: FieldAttributes =
      target.fieldType === 'select'
        ? {
            id: generators.fieldId(),
            type: 'select',
            name,
            index,
            options: {},
          }
        : {
            id: generators.fieldId(),
            type: 'text',
            name,
            index,
          };

    newFields.push(field);
    columnPlans.push({ columnIndex: i, kind: 'field', field, isNewField: true });
  }

  const optionRegistry = new Map<string, Map<string, SelectOptionAttributes>>();
  const lastOptionIndex = new Map<string, string | undefined>();

  const getOptionRegistry = (
    field: FieldAttributes
  ): Map<string, SelectOptionAttributes> => {
    let registry = optionRegistry.get(field.id);
    if (registry) {
      return registry;
    }

    registry = new Map<string, SelectOptionAttributes>();
    let maxIndex: string | undefined;
    if (
      (field.type === 'select' || field.type === 'multi_select') &&
      field.options
    ) {
      for (const option of Object.values(field.options)) {
        registry.set(option.name.trim().toLowerCase(), option);
        if (!maxIndex || compareString(option.index, maxIndex) > 0) {
          maxIndex = option.index;
        }
      }
    }

    optionRegistry.set(field.id, registry);
    lastOptionIndex.set(field.id, maxIndex);
    return registry;
  };

  const resolveOptionId = (
    plan: ColumnPlan,
    field: FieldAttributes,
    name: string
  ): string => {
    const registry = getOptionRegistry(field);
    const key = name.trim().toLowerCase();
    const existing = registry.get(key);
    if (existing) {
      return existing.id;
    }

    const index = generateFractionalIndex(lastOptionIndex.get(field.id), null);
    const option: SelectOptionAttributes = {
      id: generators.selectOptionId(),
      name: name.trim(),
      color: generators.selectOptionColor(),
      index,
    };

    registry.set(key, option);
    lastOptionIndex.set(field.id, index);

    if (plan.isNewField) {
      if (field.type === 'select' || field.type === 'multi_select') {
        field.options = { ...(field.options ?? {}), [option.id]: option };
      }
    } else {
      newOptions[field.id] = [...(newOptions[field.id] ?? []), option];
    }

    return option.id;
  };

  const buildFieldValue = (
    plan: ColumnPlan,
    field: FieldAttributes,
    raw: string
  ): FieldValue | null => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return null;
    }

    switch (field.type) {
      case 'text':
        return { type: 'text', value: trimmed };
      case 'email':
      case 'phone':
      case 'url':
        return { type: 'string', value: trimmed };
      case 'number': {
        const value = parseCsvNumber(trimmed);
        return value === null ? null : { type: 'number', value };
      }
      case 'boolean': {
        const value = parseCsvBoolean(trimmed);
        return value === null ? null : { type: 'boolean', value };
      }
      case 'date': {
        const value = parseCsvDate(trimmed);
        return value === null ? null : { type: 'string', value };
      }
      case 'select':
        return { type: 'string', value: resolveOptionId(plan, field, trimmed) };
      case 'multi_select': {
        const names = splitCsvMultiValues(trimmed);
        if (names.length === 0) {
          return null;
        }

        const ids = [
          ...new Set(names.map((name) => resolveOptionId(plan, field, name))),
        ];
        return { type: 'string_array', value: ids };
      }
      default:
        return null;
    }
  };

  const records: CsvImportRecord[] = [];
  for (const row of rows) {
    if (row.every((cell) => cell.trim().length === 0)) {
      continue;
    }

    const record: CsvImportRecord = { name: '', fields: {} };
    for (const plan of columnPlans) {
      const raw = row[plan.columnIndex] ?? '';
      if (plan.kind === 'name') {
        record.name = raw.trim();
        continue;
      }

      const field = plan.field;
      if (!field) {
        continue;
      }

      const value = buildFieldValue(plan, field, raw);
      if (value) {
        record.fields[field.id] = value;
      }
    }

    records.push(record);
  }

  return { newFields, newOptions, records };
};

export const sanitizeCsvFileName = (name: string): string => {
  const sanitized = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized.length > 0 ? sanitized : 'database';
};

export const downloadCsvFile = (fileName: string, csv: string): void => {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
