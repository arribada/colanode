// ABOUTME: Pure helpers for the client-side database Automations engine —
// ABOUTME: coerce an action value into a FieldValue, detect changed record
// ABOUTME: fields, and build an AI context string from a record's fields.
import {
  DatabaseAutomation,
  FieldAttributes,
  FieldValue,
} from '@colanode/core';

export type AutomationTriggerType = 'record_created' | 'record_updated';

// Field types whose value is stored as a plain string (option id, iso date,
// url, email, phone, free string).
const STRING_FIELD_TYPES = new Set([
  'select',
  'date',
  'url',
  'email',
  'phone',
  'created_by',
  'updated_by',
]);

// Field types whose value is stored as an array of strings.
const STRING_ARRAY_FIELD_TYPES = new Set([
  'multi_select',
  'relation',
  'collaborator',
]);

// Coerce a raw automation value into the FieldValue shape expected for the
// given field type. Returns null when the value should CLEAR the field. Returns
// undefined when the value cannot be applied to this field type (skip it).
export const buildAutomationFieldValue = (
  fieldType: string,
  value: string | number | boolean | string[] | null | undefined
): FieldValue | null | undefined => {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  if (fieldType === 'boolean') {
    return { type: 'boolean', value: Boolean(value) };
  }

  if (fieldType === 'number') {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) {
      return undefined;
    }
    return { type: 'number', value: num };
  }

  if (fieldType === 'text') {
    return { type: 'text', value: String(value) };
  }

  if (STRING_ARRAY_FIELD_TYPES.has(fieldType)) {
    const arr = Array.isArray(value) ? value.map(String) : [String(value)];
    return { type: 'string_array', value: arr };
  }

  if (STRING_FIELD_TYPES.has(fieldType)) {
    const str = Array.isArray(value) ? (value[0] ?? '') : String(value);
    return { type: 'string', value: str };
  }

  // Derived / read-only fields (formula, rollup, created_at, updated_at, file)
  // cannot be written by an automation.
  return undefined;
};

// Compute the set of field ids whose value changed between two record field
// maps (used to honour a record_updated trigger's optional fieldId filter).
export const changedFieldIds = (
  before: Record<string, FieldValue> | undefined,
  after: Record<string, FieldValue> | undefined
): Set<string> => {
  const result = new Set<string>();
  const beforeMap = before ?? {};
  const afterMap = after ?? {};
  const ids = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)]);
  for (const id of ids) {
    const a = beforeMap[id];
    const b = afterMap[id];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      result.add(id);
    }
  }
  return result;
};

// Return the enabled automations that match the given trigger and (for
// record_updated) whose optional fieldId filter is satisfied by the change set.
export const matchingAutomations = (
  automations: DatabaseAutomation[] | null | undefined,
  trigger: AutomationTriggerType,
  changed: Set<string> | undefined
): DatabaseAutomation[] => {
  if (!automations || automations.length === 0) {
    return [];
  }

  return automations.filter((automation) => {
    if (!automation.enabled) {
      return false;
    }
    if (automation.trigger.type !== trigger) {
      return false;
    }
    if (trigger === 'record_updated' && automation.trigger.fieldId) {
      if (!changed || !changed.has(automation.trigger.fieldId)) {
        return false;
      }
    }
    return true;
  });
};

// Build a compact 'Field: value' context block from a record's fields, for the
// ai_fill action. `skipFieldId` omits the field being filled.
export const buildAutomationAiContext = (
  fields: Record<string, FieldValue> | undefined,
  fieldDefs: Record<string, FieldAttributes>,
  skipFieldId?: string
): string => {
  const lines: string[] = [];
  for (const [fieldId, value] of Object.entries(fields ?? {})) {
    if (skipFieldId && fieldId === skipFieldId) {
      continue;
    }
    const def = fieldDefs[fieldId];
    const name = def?.name ?? fieldId;
    let rendered = '';
    if (value.type === 'string' || value.type === 'text') {
      rendered = value.value;
    } else if (value.type === 'number') {
      rendered = String(value.value);
    } else if (value.type === 'boolean') {
      rendered = value.value ? 'yes' : 'no';
    } else if (value.type === 'string_array') {
      rendered = value.value.join(', ');
    }
    if (rendered) {
      lines.push(name + ': ' + rendered);
    }
  }
  return lines.join('\n');
};
