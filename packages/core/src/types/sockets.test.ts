import { describe, expect, it } from 'vitest';

import {
  presenceStateSchema,
  presenceUpdateMessageSchema,
  presenceLeaveMessageSchema,
} from '@colanode/core';

const validPresence = {
  userId: 'u1',
  deviceId: 'd1',
  workspaceId: 'w1',
  rootId: 'r1',
  nodeId: 'n1',
  kind: 'doc' as const,
  name: 'Ada',
  color: '#ff0000',
  avatar: null,
  payload: { anchor: 3, head: 7 },
  ts: 1_700_000_000_000,
};

describe('presence schemas', () => {
  it('parses a valid doc presence state', () => {
    const parsed = presenceStateSchema.parse(validPresence);
    expect(parsed.kind).toBe('doc');
    expect(parsed.payload.anchor).toBe(3);
    expect(parsed.payload.head).toBe(7);
  });

  it('parses a valid board presence state with a pointer', () => {
    const parsed = presenceStateSchema.parse({
      ...validPresence,
      kind: 'board',
      payload: {
        pointer: { x: 12.5, y: -4 },
        selectedElementIds: ['el1', 'el2'],
        editingElementId: null,
      },
    });
    expect(parsed.kind).toBe('board');
    expect(parsed.payload.pointer).toEqual({ x: 12.5, y: -4 });
    expect(parsed.payload.selectedElementIds).toHaveLength(2);
  });

  it('rejects an unknown presence kind', () => {
    expect(() =>
      presenceStateSchema.parse({ ...validPresence, kind: 'video' })
    ).toThrow();
  });

  it('rejects a presence state missing required identity fields', () => {
    const { userId: _userId, ...withoutUser } = validPresence;
    expect(() => presenceStateSchema.parse(withoutUser)).toThrow();
  });

  it('parses a presence.update message', () => {
    const parsed = presenceUpdateMessageSchema.parse({
      type: 'presence.update',
      presence: validPresence,
    });
    expect(parsed.type).toBe('presence.update');
    expect(parsed.presence.userId).toBe('u1');
  });

  it('parses a presence.leave message', () => {
    const parsed = presenceLeaveMessageSchema.parse({
      type: 'presence.leave',
      userId: 'u1',
      deviceId: 'd1',
      workspaceId: 'w1',
      rootId: 'r1',
      nodeId: 'n1',
      kind: 'board',
    });
    expect(parsed.nodeId).toBe('n1');
  });
});
