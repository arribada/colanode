import { z } from 'zod/v4';

import {
  SynchronizerInput,
  SynchronizerMap,
} from '@colanode/core/synchronizers';

export const socketInitOutputSchema = z.object({
  id: z.string(),
});

export type SocketInitOutput = z.infer<typeof socketInitOutputSchema>;

export type SynchronizerInputMessage = {
  type: 'synchronizer.input';
  id: string;
  userId: string;
  input: SynchronizerInput;
  cursor: string;
};

export type SynchronizerOutputMessage<TInput extends SynchronizerInput> = {
  type: 'synchronizer.output';
  userId: string;
  id: string;
  items: {
    cursor: string;
    data: SynchronizerMap[TInput['type']]['data'];
  }[];
};

export type AccountUpdatedMessage = {
  type: 'account.updated';
  accountId: string;
};

export type WorkspaceUpdatedMessage = {
  type: 'workspace.updated';
  workspaceId: string;
};

export type WorkspaceDeletedMessage = {
  type: 'workspace.deleted';
  accountId: string;
};

export type UserCreatedMessage = {
  type: 'user.created';
  accountId: string;
  workspaceId: string;
  userId: string;
};

export type UserUpdatedMessage = {
  type: 'user.updated';
  accountId: string;
  userId: string;
};

// ---------------------------------------------------------------------------
// Ephemeral presence (live cursors / pointers)
//
// Presence is a best-effort, NON-persisted relay: a user publishes where their
// caret (doc) or pointer (board) is, and the server fans it out to every other
// connected user who shares access to the same root. Nothing is written to the
// database and everything is dropped on disconnect.
// ---------------------------------------------------------------------------

export const presenceKindSchema = z.enum(['doc', 'board']);
export type PresenceKind = z.infer<typeof presenceKindSchema>;

export const presencePayloadSchema = z.object({
  // Document caret / selection as absolute ProseMirror positions. When
  // anchor === head the selection is collapsed (a plain caret).
  anchor: z.number().optional(),
  head: z.number().optional(),
  // Board pointer in scene coordinates.
  pointer: z.object({ x: z.number(), y: z.number() }).optional(),
  // Board element(s) the user currently has selected / is dragging.
  selectedElementIds: z.array(z.string()).optional(),
  // Board element the user is currently editing (inline text edit).
  editingElementId: z.string().nullable().optional(),
});
export type PresencePayload = z.infer<typeof presencePayloadSchema>;

export const presenceStateSchema = z.object({
  userId: z.string(),
  // Origin device. Authored by the server on relay so it cannot be spoofed;
  // clients may send an empty string. Combined with userId it forms the stable
  // identity of a single presence "session".
  deviceId: z.string(),
  workspaceId: z.string(),
  rootId: z.string(),
  nodeId: z.string(),
  kind: presenceKindSchema,
  name: z.string(),
  color: z.string(),
  avatar: z.string().nullable().optional(),
  payload: presencePayloadSchema,
  // Client timestamp (ms) when the presence was produced.
  ts: z.number(),
});
export type PresenceState = z.infer<typeof presenceStateSchema>;

export const presenceUpdateMessageSchema = z.object({
  type: z.literal('presence.update'),
  presence: presenceStateSchema,
});
export type PresenceUpdateMessage = z.infer<typeof presenceUpdateMessageSchema>;

export const presenceLeaveMessageSchema = z.object({
  type: z.literal('presence.leave'),
  userId: z.string(),
  deviceId: z.string(),
  workspaceId: z.string(),
  rootId: z.string(),
  nodeId: z.string(),
  kind: presenceKindSchema,
});
export type PresenceLeaveMessage = z.infer<typeof presenceLeaveMessageSchema>;

export type Message =
  | AccountUpdatedMessage
  | WorkspaceUpdatedMessage
  | WorkspaceDeletedMessage
  | UserCreatedMessage
  | UserUpdatedMessage
  | SynchronizerInputMessage
  | SynchronizerOutputMessage<SynchronizerInput>
  | PresenceUpdateMessage
  | PresenceLeaveMessage;
