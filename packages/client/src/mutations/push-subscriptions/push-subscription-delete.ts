export type PushSubscriptionDeleteMutationInput = {
  type: 'pushSubscription.delete';
  userId: string;
  endpoint: string;
};

export type PushSubscriptionDeleteMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'pushSubscription.delete': {
      input: PushSubscriptionDeleteMutationInput;
      output: PushSubscriptionDeleteMutationOutput;
    };
  }
}
