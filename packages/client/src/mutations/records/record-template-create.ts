import { FieldValue } from '@colanode/core';

export type RecordTemplateCreateMutationInput = {
  type: 'record.template.create';
  userId: string;
  templateId: string;
  // Optional per-field overrides applied on top of the template's own field
  // values, e.g. the active view filters (board column, calendar day) so the
  // created record lands where the user actually clicked "New from template".
  fieldOverrides?: Record<string, FieldValue>;
};

export type RecordTemplateCreateMutationOutput = {
  id: string;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'record.template.create': {
      input: RecordTemplateCreateMutationInput;
      output: RecordTemplateCreateMutationOutput;
    };
  }
}
