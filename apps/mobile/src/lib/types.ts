import { MutationInput, MutationResult } from '@colanode/client/mutations';
import { QueryInput, QueryMap } from '@colanode/client/queries';
import { AppInitOutput, Event } from '@colanode/client/types';

declare global {
  interface Window {
    ReactNativeWebView: {
      postMessage: (message: string) => void;
    };
  }
}

// Mirrors @colanode/ui/window's WebPushState. Defined here (not in
// services/push-service.ts) so it can be imported by main.tsx, which is
// bundled into the WebView content and must never pull in a react-native /
// expo-notifications import.
export type MobilePushState = 'unsupported' | 'denied' | 'enabled' | 'disabled';

export type InitMessage = {
  type: 'init';
};

export type InitResultMessage = {
  type: 'init_result';
  output: AppInitOutput;
};

export type MutationMessage = {
  type: 'mutation';
  mutationId: string;
  input: MutationInput;
};

export type MutationResultMessage = {
  type: 'mutation_result';
  mutationId: string;
  result: MutationResult<MutationInput>;
};

export type PushEnableMessage = {
  type: 'push_enable';
  requestId: string;
  userId: string;
};

export type PushEnableResultMessage = {
  type: 'push_enable_result';
  requestId: string;
  success: boolean;
};

export type PushDisableMessage = {
  type: 'push_disable';
  requestId: string;
  userId: string;
};

export type PushDisableResultMessage = {
  type: 'push_disable_result';
  requestId: string;
};

export type PushGetStateMessage = {
  type: 'push_get_state';
  requestId: string;
};

export type PushGetStateResultMessage = {
  type: 'push_get_state_result';
  requestId: string;
  state: MobilePushState;
};

export type QueryMessage = {
  type: 'query';
  queryId: string;
  input: QueryInput;
};

export type QueryResultMessage = {
  type: 'query_result';
  queryId: string;
  result: QueryMap[QueryInput['type']]['output'];
};

export type QueryAndSubscribeMessage = {
  type: 'query_and_subscribe';
  queryId: string;
  key: string;
  windowId: string;
  input: QueryInput;
};

export type QueryAndSubscribeResultMessage = {
  type: 'query_and_subscribe_result';
  key: string;
  windowId: string;
  queryId: string;
  result: QueryMap[QueryInput['type']]['output'];
};

export type QueryUnsubscribeMessage = {
  type: 'query_unsubscribe';
  key: string;
  windowId: string;
};

export type EventMessage = {
  type: 'event';
  windowId: string;
  event: Event;
};

export type ConsoleMessage = {
  type: 'console';
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: string;
};

export type Message =
  | InitMessage
  | InitResultMessage
  | MutationMessage
  | MutationResultMessage
  | PushEnableMessage
  | PushEnableResultMessage
  | PushDisableMessage
  | PushDisableResultMessage
  | PushGetStateMessage
  | PushGetStateResultMessage
  | QueryMessage
  | QueryResultMessage
  | QueryAndSubscribeMessage
  | QueryAndSubscribeResultMessage
  | QueryUnsubscribeMessage
  | EventMessage
  | ConsoleMessage;

export type PendingInit = {
  type: 'init';
  resolve: (result: AppInitOutput) => void;
  reject: (error: string) => void;
};

export type PendingQuery = {
  type: 'query';
  queryId: string;
  input: QueryInput;
  resolve: (result: QueryMap[QueryInput['type']]['output']) => void;
  reject: (error: string) => void;
};

export type PendingQueryAndSubscribe = {
  type: 'query_and_subscribe';
  queryId: string;
  key: string;
  windowId: string;
  input: QueryInput;
  resolve: (result: QueryMap[QueryInput['type']]['output']) => void;
  reject: (error: string) => void;
};

export type PendingMutation = {
  type: 'mutation';
  mutationId: string;
  input: MutationInput;
  resolve: (result: MutationResult<MutationInput>) => void;
  reject: (error: string) => void;
};

export type PendingPushEnable = {
  type: 'push_enable';
  requestId: string;
  resolve: (result: boolean) => void;
  reject: (error: string) => void;
};

export type PendingPushDisable = {
  type: 'push_disable';
  requestId: string;
  resolve: () => void;
  reject: (error: string) => void;
};

export type PendingPushGetState = {
  type: 'push_get_state';
  requestId: string;
  resolve: (result: MobilePushState) => void;
  reject: (error: string) => void;
};

export type PendingPromise =
  | PendingInit
  | PendingQuery
  | PendingQueryAndSubscribe
  | PendingMutation
  | PendingPushEnable
  | PendingPushDisable
  | PendingPushGetState;
