export type MessageTaskSetMutationInput = {
  type: 'message.task.set';
  userId: string;
  messageId: string;
  taskId: string | null;
};

export type MessageTaskSetMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'message.task.set': {
      input: MessageTaskSetMutationInput;
      output: MessageTaskSetMutationOutput;
    };
  }
}
