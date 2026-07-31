import { useForm, useStore } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod/v4';

import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  compareString,
  FieldAttributes,
  FieldType,
  FormulaResultType,
  generateFractionalIndex,
  generateId,
  IdType,
  RollupAggregation,
} from '@colanode/core';
import { DatabaseSelect } from '@colanode/ui/components/databases/database-select';
import { FieldTypeSelect } from '@colanode/ui/components/databases/fields/field-type-select';
import { FormulaExpressionEditor } from '@colanode/ui/components/databases/fields/formula-expression-editor';
import { RollupConfigEditor } from '@colanode/ui/components/databases/fields/rollup-config-editor';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@colanode/ui/components/ui/field';
import { Input } from '@colanode/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

const formSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  type: z.union([
    z.literal('boolean'),
    z.literal('collaborator'),
    z.literal('created_at'),
    z.literal('created_by'),
    z.literal('date'),
    z.literal('email'),
    z.literal('file'),
    z.literal('formula'),
    z.literal('multi_select'),
    z.literal('number'),
    z.literal('phone'),
    z.literal('rollup'),
    z.literal('select'),
    z.literal('text'),
    z.literal('relation'),
    z.literal('updated_at'),
    z.literal('updated_by'),
    z.literal('url'),
  ]),
  relationDatabaseId: z.string().optional().nullable(),
  expression: z.string().optional(),
  formulaResultType: z
    .enum(['number', 'string', 'boolean', 'date'])
    .optional()
    .nullable(),
  rollupRelationFieldId: z.string().optional().nullable(),
  rollupTargetFieldId: z.string().optional().nullable(),
  rollupAggregation: z
    .enum([
      'count',
      'sum',
      'average',
      'min',
      'max',
      'earliest',
      'latest',
      'percent_checked',
      'show_original',
    ])
    .optional()
    .nullable(),
});

const defaultValues: FieldCreateFormValues = {
  name: '',
  type: 'text',
  relationDatabaseId: null,
  expression: '',
  formulaResultType: null,
  rollupRelationFieldId: null,
  rollupTargetFieldId: null,
  rollupAggregation: null,
};

type FieldCreateFormValues = z.infer<typeof formSchema>;

interface FieldCreatePopoverProps {
  button: React.ReactNode;
  onSuccess?: (fieldId: string) => void;
  types?: FieldType[];
}

export const FieldCreatePopover = ({
  button,
  onSuccess,
  types,
}: FieldCreatePopoverProps) => {
  const [open, setOpen] = useState(false);
  const workspace = useWorkspace();
  const database = useDatabase();

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      mutate(value);
    },
  });

  const type = useStore(form.store, (state) => state.values.type);
  const expression = useStore(
    form.store,
    (state) => state.values.expression ?? ''
  );
  const formulaResultType = useStore(
    form.store,
    (state) => state.values.formulaResultType ?? null
  );
  const rollupRelationFieldId = useStore(
    form.store,
    (state) => state.values.rollupRelationFieldId ?? null
  );
  const rollupTargetFieldId = useStore(
    form.store,
    (state) => state.values.rollupTargetFieldId ?? null
  );
  const rollupAggregation = useStore(
    form.store,
    (state) => state.values.rollupAggregation ?? null
  );

  const handleCancelClick = () => {
    setOpen(false);
    form.reset();
  };

  const { mutate, isPending } = useMutation({
    mutationFn: async (values: FieldCreateFormValues) => {
      const nodes = workspace.collections.nodes;

      if (values.type === 'relation') {
        if (!values.relationDatabaseId) {
          throw new MutationError(
            MutationErrorCode.RelationDatabaseNotFound,
            'Relation database not found.'
          );
        }

        const relationDatabase = nodes.get(values.relationDatabaseId);
        if (!relationDatabase || relationDatabase.type !== 'database') {
          throw new MutationError(
            MutationErrorCode.RelationDatabaseNotFound,
            'Relation database not found.'
          );
        }
      }

      if (values.type === 'formula') {
        if (!values.expression || values.expression.trim().length === 0) {
          throw new Error('Formula expression is required.');
        }
      }

      if (values.type === 'rollup') {
        if (!values.rollupRelationFieldId) {
          throw new Error('A relation field is required for a rollup.');
        }
        if (!values.rollupAggregation) {
          throw new Error('An aggregation is required for a rollup.');
        }
        if (
          values.rollupAggregation !== 'count' &&
          !values.rollupTargetFieldId
        ) {
          throw new Error('A field to aggregate is required.');
        }
      }

      if (!nodes.has(database.id)) {
        return null;
      }

      const fieldId = generateId(IdType.Field);
      nodes.update(database.id, (draft) => {
        if (draft.type !== 'database') {
          return;
        }

        const maxIndex = Object.values(draft.fields)
          .map((field) => field.index)
          .sort((a, b) => -compareString(a, b))[0];

        const index = generateFractionalIndex(maxIndex, null);

        let newField: FieldAttributes;
        if (values.type === 'formula') {
          newField = {
            id: fieldId,
            type: 'formula',
            name: values.name,
            index,
            expression: values.expression ?? '',
            resultType: values.formulaResultType ?? null,
          };
        } else if (values.type === 'rollup') {
          newField = {
            id: fieldId,
            type: 'rollup',
            name: values.name,
            index,
            relationFieldId: values.rollupRelationFieldId ?? null,
            targetFieldId: values.rollupTargetFieldId ?? null,
            aggregation: values.rollupAggregation ?? null,
          };
        } else if (values.type === 'relation') {
          newField = {
            id: fieldId,
            type: 'relation',
            name: values.name,
            index,
            databaseId: values.relationDatabaseId,
          };
        } else {
          newField = {
            id: fieldId,
            type: values.type,
            name: values.name,
            index,
          } as FieldAttributes;
        }

        draft.fields[fieldId] = newField;
      });

      return fieldId;
    },
    onSuccess: (fieldId) => {
      form.reset();
      setOpen(false);

      if (fieldId) {
        onSuccess?.(fieldId);
      }
    },
    onError: (error) => {
      toast.error(error.message as string);
    },
  });

  if (!database.canEdit || database.isLocked) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent className="mr-5 w-lg max-h-[80vh] overflow-y-auto" side="bottom">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="grow space-y-4 py-2 pb-4">
            <FieldGroup>
              <form.Field
                name="name"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="Field name"
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              />
              <form.Field
                name="type"
                children={(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Field type</FieldLabel>
                    <FieldTypeSelect
                      value={field.state.value}
                      onChange={(value) =>
                        field.handleChange(
                          value as FieldCreateFormValues['type']
                        )
                      }
                      types={types}
                    />
                  </Field>
                )}
              />
              {type === 'relation' && (
                <form.Field
                  name="relationDatabaseId"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Database</FieldLabel>
                      <DatabaseSelect
                        id={field.state.value}
                        onChange={(value) => field.handleChange(value)}
                      />
                    </Field>
                  )}
                />
              )}
              {type === 'formula' && (
                <Field>
                  <FormulaExpressionEditor
                    expression={expression}
                    onExpressionChange={(value) =>
                      form.setFieldValue('expression', value)
                    }
                    resultType={formulaResultType as FormulaResultType | null}
                    onResultTypeChange={(value) =>
                      form.setFieldValue('formulaResultType', value)
                    }
                    fields={database.fields}
                  />
                </Field>
              )}
              {type === 'rollup' && (
                <Field>
                  <RollupConfigEditor
                    fields={database.fields}
                    relationFieldId={rollupRelationFieldId}
                    onRelationFieldChange={(value) =>
                      form.setFieldValue('rollupRelationFieldId', value)
                    }
                    targetFieldId={rollupTargetFieldId}
                    onTargetFieldChange={(value) =>
                      form.setFieldValue('rollupTargetFieldId', value)
                    }
                    aggregation={rollupAggregation as RollupAggregation | null}
                    onAggregationChange={(value) =>
                      form.setFieldValue('rollupAggregation', value)
                    }
                  />
                </Field>
              )}
            </FieldGroup>
          </div>
          <div className="mt-2 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancelClick}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              data-testid="field-create-submit"
            >
              {isPending && <Spinner className="mr-1" />}
              Create
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};
