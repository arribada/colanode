// ABOUTME: "Conditional color" settings section for a database view — lets a
// ABOUTME: user color rows/cards when a record matches a field/operator/value rule.
import { ChevronDown, ChevronRight, Palette, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  DatabaseViewConditionalColorAttributes,
  FieldAttributes,
  MultiSelectFieldAttributes,
  SelectFieldAttributes,
} from '@colanode/core';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  getSelectOptionLightColorClass,
  selectOptionColors,
} from '@colanode/ui/lib/databases';
import { cn } from '@colanode/ui/lib/utils';

// Field types a conditional-color rule can target. Formula/rollup are derived
// and not stored, so they cannot be matched the same way as the other fields.
const COLORABLE_TYPES = [
  'select',
  'multi_select',
  'boolean',
  'text',
  'number',
  'url',
  'email',
  'phone',
];

const generateRuleId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const getFieldOptions = (field: FieldAttributes) => {
  if (field.type !== 'select' && field.type !== 'multi_select') {
    return [];
  }

  const options =
    (field as SelectFieldAttributes | MultiSelectFieldAttributes).options ?? {};

  return Object.values(options).sort((a, b) => a.index.localeCompare(b.index));
};

const defaultRuleForField = (
  field: FieldAttributes,
  color: string
): DatabaseViewConditionalColorAttributes => {
  if (field.type === 'select' || field.type === 'multi_select') {
    const options = getFieldOptions(field);
    return {
      id: generateRuleId(),
      fieldId: field.id,
      operator: 'is_in',
      value: options[0] ? [options[0].id] : [],
      color,
    };
  }

  if (field.type === 'boolean') {
    return {
      id: generateRuleId(),
      fieldId: field.id,
      operator: 'is_true',
      value: null,
      color,
    };
  }

  if (field.type === 'number') {
    return {
      id: generateRuleId(),
      fieldId: field.id,
      operator: 'is_equal_to',
      value: null,
      color,
    };
  }

  return {
    id: generateRuleId(),
    fieldId: field.id,
    operator: 'is_equal_to',
    value: '',
    color,
  };
};

const textOperators = [
  { value: 'is_equal_to', label: 'is' },
  { value: 'is_not_equal_to', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'does_not_contain', label: 'does not contain' },
];

const numberOperators = [
  { value: 'is_equal_to', label: '=' },
  { value: 'is_not_equal_to', label: '≠' },
  { value: 'is_greater_than', label: '>' },
  { value: 'is_less_than', label: '<' },
  { value: 'is_greater_than_or_equal_to', label: '≥' },
  { value: 'is_less_than_or_equal_to', label: '≤' },
];

const booleanOperators = [
  { value: 'is_true', label: 'is checked' },
  { value: 'is_false', label: 'is unchecked' },
];

const selectClass =
  'h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none';
const inputClass =
  'h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs outline-none';

export const ViewConditionalColorSettings = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const [expanded, setExpanded] = useState(false);

  const canEdit = database.canEdit && !database.isLocked;
  const rules = view.conditionalColors ?? [];
  const colorableFields = database.fields.filter((field) =>
    COLORABLE_TYPES.includes(field.type)
  );

  const updateRules = (
    updater: (
      current: DatabaseViewConditionalColorAttributes[]
    ) => DatabaseViewConditionalColorAttributes[]
  ) => {
    if (!canEdit) {
      return;
    }

    workspace.collections.nodes.update(view.id, (draft) => {
      if (draft.type !== 'database_view') {
        return;
      }

      draft.conditionalColors = updater(draft.conditionalColors ?? []);
    });
  };

  const updateRule = (
    id: string,
    patch: Partial<DatabaseViewConditionalColorAttributes>
  ) => {
    updateRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule))
    );
  };

  const removeRule = (id: string) => {
    updateRules((current) => current.filter((rule) => rule.id !== id));
  };

  const addRule = () => {
    const field = colorableFields[0];
    if (!field) {
      return;
    }

    const usedColors = new Set(rules.map((rule) => rule.color));
    const nextColor =
      selectOptionColors.find((color) => !usedColors.has(color.value))?.value ??
      selectOptionColors[0]!.value;

    updateRules((current) => [
      ...current,
      defaultRuleForField(field, nextColor),
    ]);
  };

  const onFieldChange = (
    rule: DatabaseViewConditionalColorAttributes,
    fieldId: string
  ) => {
    const field = database.fields.find((f) => f.id === fieldId);
    if (!field) {
      return;
    }

    const next = defaultRuleForField(field, rule.color);
    updateRule(rule.id, {
      fieldId,
      operator: next.operator,
      value: next.value,
    });
  };

  const renderValueEditor = (
    rule: DatabaseViewConditionalColorAttributes,
    field: FieldAttributes
  ) => {
    if (field.type === 'select' || field.type === 'multi_select') {
      const options = getFieldOptions(field);
      const selected = Array.isArray(rule.value) ? rule.value[0] : undefined;
      return (
        <select
          className={selectClass}
          disabled={!canEdit}
          value={selected ?? ''}
          onChange={(event) =>
            updateRule(rule.id, { value: [event.target.value] })
          }
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'boolean') {
      return (
        <select
          className={selectClass}
          disabled={!canEdit}
          value={rule.operator}
          onChange={(event) =>
            updateRule(rule.id, { operator: event.target.value, value: null })
          }
        >
          {booleanOperators.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'number') {
      const numberValue =
        typeof rule.value === 'number' ? String(rule.value) : '';
      return (
        <div className="flex flex-1 flex-row items-center gap-1">
          <select
            className={selectClass}
            disabled={!canEdit}
            value={rule.operator}
            onChange={(event) =>
              updateRule(rule.id, { operator: event.target.value })
            }
          >
            {numberOperators.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            className={inputClass}
            disabled={!canEdit}
            value={numberValue}
            onChange={(event) => {
              const parsed = event.target.value;
              updateRule(rule.id, {
                value: parsed === '' ? null : Number(parsed),
              });
            }}
          />
        </div>
      );
    }

    // text / url / email / phone
    const textValue = typeof rule.value === 'string' ? rule.value : '';
    return (
      <div className="flex flex-1 flex-row items-center gap-1">
        <select
          className={selectClass}
          disabled={!canEdit}
          value={rule.operator}
          onChange={(event) =>
            updateRule(rule.id, { operator: event.target.value })
          }
        >
          {textOperators.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          className={inputClass}
          disabled={!canEdit}
          value={textValue}
          onChange={(event) =>
            updateRule(rule.id, { value: event.target.value })
          }
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <button
        type="button"
        className="flex w-full cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left hover:bg-accent"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <Palette className="size-4" />
        <span className="font-semibold">Conditional color</span>
        {rules.length > 0 && (
          <span className="text-muted-foreground">({rules.length})</span>
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 pl-1">
          {rules.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Color rows and cards when a record matches a rule.
            </p>
          )}

          {rules.map((rule) => {
            const field = database.fields.find((f) => f.id === rule.fieldId);
            const colorClass = getSelectOptionLightColorClass(rule.color);

            return (
              <div
                key={rule.id}
                className="flex flex-col gap-1 rounded-md border p-1.5"
              >
                <div className="flex flex-row items-center gap-1">
                  <span
                    className={cn(
                      'size-4 shrink-0 rounded-full border',
                      colorClass
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <FieldSelect
                      fields={colorableFields}
                      value={rule.fieldId}
                      onChange={(fieldId) => onFieldChange(rule, fieldId)}
                    />
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => removeRule(rule.id)}
                      aria-label="Remove rule"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>

                {field ? (
                  <div className="flex flex-row items-center gap-1">
                    {renderValueEditor(rule, field)}
                    <select
                      className={selectClass}
                      disabled={!canEdit}
                      value={rule.color}
                      onChange={(event) =>
                        updateRule(rule.id, { color: event.target.value })
                      }
                    >
                      {selectOptionColors.map((color) => (
                        <option key={color.value} value={color.value}>
                          {color.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This field no longer exists.
                  </p>
                )}
              </div>
            );
          })}

          {canEdit && colorableFields.length > 0 && (
            <button
              type="button"
              className="flex w-full cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={addRule}
            >
              <Plus className="size-4" />
              <span>Add rule</span>
            </button>
          )}

          {colorableFields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add a select, text, number or checkbox field to use conditional
              color.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
