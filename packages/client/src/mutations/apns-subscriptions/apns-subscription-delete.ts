export type ApnsSubscriptionDeleteMutationInput = {
  type: 'apnsSubscription.delete';
  userId: string;
  deviceToken: string;
};

export type ApnsSubscriptionDeleteMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'apnsSubscription.delete': {
      input: ApnsSubscriptionDeleteMutationInput;
      output: ApnsSubscriptionDeleteMutationOutput;
    };
  }
}
