export type ApnsSubscriptionCreateMutationInput = {
  type: 'apnsSubscription.create';
  userId: string;
  deviceToken: string;
};

export type ApnsSubscriptionCreateMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'apnsSubscription.create': {
      input: ApnsSubscriptionCreateMutationInput;
      output: ApnsSubscriptionCreateMutationOutput;
    };
  }
}
