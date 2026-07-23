import { describe, expect, it } from 'vitest';

import {
  boardElementSchema,
  boardSceneSchema,
  whiteboardAttributesSchema,
  whiteboardModel,
} from '@colanode/core/registry/nodes/whiteboard';

const sticky = {
  id: 'el1wb',
  type: 'sticky' as const,
  x: 10,
  y: 20,
  w: 160,
  h: 120,
  z: 'a0',
  style: { fill: '#fff7ae', color: '#1f2937' },
  text: 'Idea one',
};

describe('boardElementSchema', () => {
  it('accepts a well-formed element', () => {
    expect(boardElementSchema.safeParse(sticky).success).toBe(true);
  });

  it('requires geometry and z', () => {
    const { z: _z, ...noZ } = sticky;
    expect(boardElementSchema.safeParse(noZ).success).toBe(false);

    const { w: _w, ...noW } = sticky;
    expect(boardElementSchema.safeParse(noW).success).toBe(false);
  });

  it('accepts a connector element with endpoints', () => {
    const connector = {
      id: 'c1wb',
      type: 'connector' as const,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      z: 'a1',
      style: { stroke: '#334155', strokeWidth: 2 },
      points: [
        [0, 0],
        [100, 100],
      ],
      connector: {
        fromId: 'el1wb',
        toId: 'el2wb',
        fromAnchor: 'right',
        toAnchor: 'left',
        arrowEnd: true,
        label: 'depends on',
      },
    };

    expect(boardElementSchema.safeParse(connector).success).toBe(true);
  });

  it('rejects an unknown element type', () => {
    expect(
      boardElementSchema.safeParse({ ...sticky, type: 'star' }).success
    ).toBe(false);
  });
});

describe('boardSceneSchema', () => {
  it('accepts a record keyed by element id', () => {
    const scene = { [sticky.id]: sticky };
    const r = boardSceneSchema.safeParse(scene);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Object.keys(r.data)).toEqual([sticky.id]);
    }
  });
});

describe('whiteboardAttributesSchema', () => {
  it('accepts attributes without a scene', () => {
    const r = whiteboardAttributesSchema.safeParse({
      type: 'whiteboard',
      parentId: 'sp1',
      name: 'Brainstorm',
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.scene).toBeUndefined();
    }
  });

  it('accepts a board scene', () => {
    const scene = { [sticky.id]: sticky };
    const r = whiteboardAttributesSchema.safeParse({
      type: 'whiteboard',
      parentId: 'sp1',
      name: 'Brainstorm',
      avatar: null,
      scene,
    });

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.scene).toEqual(scene);
    }
  });

  it('rejects a wrong type literal', () => {
    expect(
      whiteboardAttributesSchema.safeParse({
        type: 'page',
        parentId: 'sp1',
        name: 'Brainstorm',
      }).success
    ).toBe(false);
  });

  it('rejects missing name', () => {
    expect(
      whiteboardAttributesSchema.safeParse({
        type: 'whiteboard',
        parentId: 'sp1',
      }).success
    ).toBe(false);
  });
});

describe('whiteboardModel.extractText', () => {
  it('extracts text from element text and connector labels', () => {
    const result = whiteboardModel.extractText('wb1', {
      type: 'whiteboard',
      parentId: 'sp1',
      name: 'Brainstorm',
      scene: {
        el1wb: { ...sticky, text: 'Idea one' },
        el2wb: { ...sticky, id: 'el2wb', type: 'rect', text: undefined },
        el3wb: { ...sticky, id: 'el3wb', type: 'text', text: '   ' },
        c1wb: {
          id: 'c1wb',
          type: 'connector',
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          z: 'a2',
          style: {},
          connector: { label: 'links' },
        },
      },
    });

    expect(result?.name).toBe('Brainstorm');
    expect(result?.attributes).toContain('Idea one');
    expect(result?.attributes).toContain('links');
    expect(result?.attributes).not.toContain('rect');
  });

  it('returns null attributes when there is no scene', () => {
    const result = whiteboardModel.extractText('wb1', {
      type: 'whiteboard',
      parentId: 'sp1',
      name: 'Brainstorm',
    });

    expect(result).toEqual({
      name: 'Brainstorm',
      attributes: null,
    });
  });
});
