export type PushSubscriptionCreateMutationInput = {
  type: 'pushSubscription.create';
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSubscriptionCreateMutationOutput = {
  success: boolean;
};

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'pushSubscription.create': {
      input: PushSubscriptionCreateMutationInput;
      output: PushSubscriptionCreateMutationOutput;
    };
  }
}
