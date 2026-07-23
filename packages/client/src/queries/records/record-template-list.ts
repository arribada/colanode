import { LocalRecordNode } from '@colanode/client/types/nodes';

export type RecordTemplateListQueryInput = {
  type: 'record.template.list';
  userId: string;
  databaseId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'record.template.list': {
      input: RecordTemplateListQueryInput;
      output: LocalRecordNode[];
    };
  }
}
