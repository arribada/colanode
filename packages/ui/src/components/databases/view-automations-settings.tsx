// ABOUTME: "Automations" settings section for a database — Notion-style
// ABOUTME: trigger -> action rules stored on the database node. Runs client-side.
import { Bot, ChevronDown, ChevronRight, Plus, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';

import {
  DatabaseAutomation,
  DatabaseAutomationAction,
  FieldAttributes,
  SelectFieldAttributes,
} from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

// Field types an automation can write to (derived/read-only fields excluded).
const ASSIGNABLE_TYPES = [
  'select',
  'multi_select',
  'boolean',
  'text',
  'number',
  'url',
  'email',
  'phone',
  'date',
];

const generateRuleId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const selectClass =
  'h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none';
const inputClass =
  'h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs outline-none';

const actionLabels: Record<DatabaseAutomationAction['type'], string> = {
  set_field: 'Set a field',
  ai_fill: 'Fill a field with AI',
  notify: 'Send a notification',
};

export const ViewAutomationsSettings = () => {
  const workspace = useWorkspace();
  const database = useDatabase();

  const [expanded, setExpanded] = useState(false);

  const canEdit = database.canEdit && !database.isLocked;
  const automations = database.automations ?? [];
  const assignableFields = database.fields.filter((field) =>
    ASSIGNABLE_TYPES.includes(field.type)
  );

  const update = (
    updater: (current: DatabaseAutomation[]) => DatabaseAutomation[]
  ) => {
    if (!canEdit) {
      return;
    }

    workspace.collections.nodes.update(database.id, (draft) => {
      if (draft.type !== 'database') {
        return;
      }
      draft.automations = updater(draft.automations ?? []);
    });
  };

  const patchAutomation = (id: string, patch: Partial<DatabaseAutomation>) => {
    update((current) =>
      current.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  };

  const patchAction = (
    automationId: string,
    index: number,
    patch: Partial<DatabaseAutomationAction>
  ) => {
    update((current) =>
      current.map((a) => {
        if (a.id !== automationId) {
          return a;
        }
        const actions = a.actions.map((action, i) =>
          i === index ? { ...action, ...patch } : action
        );
        return { ...a, actions };
      })
    );
  };

  const addAutomation = () => {
    update((current) => [
      ...current,
      {
        id: generateRuleId(),
        name: `Automation ${current.length + 1}`,
        enabled: true,
        trigger: { type: 'record_created' },
        actions: [{ type: 'notify', value: 'A record was created' }],
      },
    ]);
  };

  const addAction = (automationId: string) => {
    const field = assignableFields[0];
    update((current) =>
      current.map((a) => {
        if (a.id !== automationId) {
          return a;
        }
        const action: DatabaseAutomationAction = field
          ? { type: 'set_field', fieldId: field.id, value: '' }
          : { type: 'notify', value: 'A record changed' };
        return { ...a, actions: [...a.actions, action] };
      })
    );
  };

  const removeAction = (automationId: string, index: number) => {
    update((current) =>
      current.map((a) =>
        a.id === automationId
          ? { ...a, actions: a.actions.filter((_, i) => i !== index) }
          : a
      )
    );
  };

  const renderSetFieldValue = (
    automationId: string,
    index: number,
    action: DatabaseAutomationAction,
    field: FieldAttributes | undefined
  ) => {
    if (!field) {
      return null;
    }

    if (field.type === 'boolean') {
      const checked = action.value === true;
      return (
        <select
          className={selectClass}
          disabled={!canEdit}
          value={checked ? 'true' : 'false'}
          onChange={(event) =>
            patchAction(automationId, index, {
              value: event.target.value === 'true',
            })
          }
        >
          <option value="true">checked</option>
          <option value="false">unchecked</option>
        </select>
      );
    }

    if (field.type === 'number') {
      const numberValue =
        typeof action.value === 'number' ? String(action.value) : '';
      return (
        <input
          type="number"
          className={inputClass}
          disabled={!canEdit}
          value={numberValue}
          onChange={(event) =>
            patchAction(automationId, index, {
              value:
                event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      );
    }

    if (field.type === 'select') {
      const options = Object.values(
        (field as SelectFieldAttributes).options ?? {}
      );
      const selectValue = typeof action.value === 'string' ? action.value : '';
      return (
        <select
          className={selectClass}
          disabled={!canEdit}
          value={selectValue}
          onChange={(event) =>
            patchAction(automationId, index, { value: event.target.value })
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

    const textValue = typeof action.value === 'string' ? action.value : '';
    return (
      <input
        type="text"
        className={inputClass}
        disabled={!canEdit}
        placeholder="Value"
        value={textValue}
        onChange={(event) =>
          patchAction(automationId, index, { value: event.target.value })
        }
      />
    );
  };

  const renderActionValue = (
    automationId: string,
    index: number,
    action: DatabaseAutomationAction
  ) => {
    if (action.type === 'notify') {
      const message = typeof action.value === 'string' ? action.value : '';
      return (
        <input
          type="text"
          className={inputClass}
          disabled={!canEdit}
          placeholder="Notification message"
          value={message}
          onChange={(event) =>
            patchAction(automationId, index, { value: event.target.value })
          }
        />
      );
    }

    const field = database.fields.find((f) => f.id === action.fieldId);

    const fieldPicker = (
      <select
        className={selectClass}
        disabled={!canEdit}
        value={action.fieldId ?? ''}
        onChange={(event) =>
          patchAction(automationId, index, { fieldId: event.target.value })
        }
      >
        <option value="">Select field…</option>
        {assignableFields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    );

    if (action.type === 'ai_fill') {
      const prompt = typeof action.prompt === 'string' ? action.prompt : '';
      return (
        <div className="flex flex-1 flex-col gap-1">
          {fieldPicker}
          <input
            type="text"
            className={inputClass}
            disabled={!canEdit}
            placeholder="AI prompt (optional)"
            value={prompt}
            onChange={(event) =>
              patchAction(automationId, index, { prompt: event.target.value })
            }
          />
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col gap-1">
        {fieldPicker}
        {renderSetFieldValue(automationId, index, action, field)}
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
        <Zap className="size-4" />
        <span className="font-semibold">Automations</span>
        {automations.length > 0 && (
          <span className="text-muted-foreground">({automations.length})</span>
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 pl-1">
          {automations.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Run actions automatically when a record is created or updated.
              Automations run on this device when you make the change.
            </p>
          )}

          {automations.map((automation) => (
            <div
              key={automation.id}
              className="flex flex-col gap-1.5 rounded-md border p-1.5"
            >
              <div className="flex flex-row items-center gap-1">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={automation.enabled}
                  onChange={(event) =>
                    patchAutomation(automation.id, {
                      enabled: event.target.checked,
                    })
                  }
                  aria-label="Enable automation"
                />
                <input
                  type="text"
                  className={inputClass}
                  disabled={!canEdit}
                  value={automation.name}
                  onChange={(event) =>
                    patchAutomation(automation.id, { name: event.target.value })
                  }
                />
                {canEdit && (
                  <button
                    type="button"
                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      update((current) =>
                        current.filter((a) => a.id !== automation.id)
                      )
                    }
                    aria-label="Remove automation"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-row items-center gap-1">
                <span className="text-xs text-muted-foreground">When</span>
                <select
                  className={selectClass}
                  disabled={!canEdit}
                  value={automation.trigger.type}
                  onChange={(event) =>
                    patchAutomation(automation.id, {
                      trigger: {
                        ...automation.trigger,
                        type: event.target.value as
                          | 'record_created'
                          | 'record_updated',
                      },
                    })
                  }
                >
                  <option value="record_created">a record is created</option>
                  <option value="record_updated">a record is updated</option>
                </select>
              </div>

              {automation.trigger.type === 'record_updated' && (
                <div className="flex flex-row items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    only when
                  </span>
                  <select
                    className={selectClass}
                    disabled={!canEdit}
                    value={automation.trigger.fieldId ?? ''}
                    onChange={(event) =>
                      patchAutomation(automation.id, {
                        trigger: {
                          ...automation.trigger,
                          fieldId: event.target.value || null,
                        },
                      })
                    }
                  >
                    <option value="">any field changes</option>
                    {database.fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} changes
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                {automation.actions.map((action, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-1 rounded-md bg-muted/40 p-1"
                  >
                    <div className="flex flex-row items-center gap-1">
                      {action.type === 'ai_fill' ? (
                        <Bot className="size-3.5 shrink-0" />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Then
                        </span>
                      )}
                      <select
                        className={selectClass}
                        disabled={!canEdit}
                        value={action.type}
                        onChange={(event) =>
                          patchAction(automation.id, index, {
                            type: event.target
                              .value as DatabaseAutomationAction['type'],
                          })
                        }
                      >
                        {Object.entries(actionLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {canEdit && (
                        <button
                          type="button"
                          className="cursor-pointer text-muted-foreground hover:text-foreground"
                          onClick={() => removeAction(automation.id, index)}
                          aria-label="Remove action"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {renderActionValue(automation.id, index, action)}
                  </div>
                ))}

                {canEdit && (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => addAction(automation.id)}
                  >
                    <Plus className="size-3.5" />
                    <span>Add action</span>
                  </button>
                )}
              </div>
            </div>
          ))}

          {canEdit && (
            <button
              type="button"
              className="flex w-full cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={addAutomation}
            >
              <Plus className="size-4" />
              <span>Add automation</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
