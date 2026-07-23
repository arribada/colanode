import { describe, expect, it } from 'vitest';

import {
  whiteboardAttributesSchema,
  whiteboardModel,
} from '@colanode/core/registry/nodes/whiteboard';

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

  it('accepts an excalidraw scene blob', () => {
    const scene = {
      elements: [
        {
          id: 'el1',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 80,
        },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    };

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
  it('extracts text from non-deleted text elements for search', () => {
    const result = whiteboardModel.extractText('wb1', {
      type: 'whiteboard',
      parentId: 'sp1',
      name: 'Brainstorm',
      scene: {
        elements: [
          { id: 'el1', type: 'text', text: 'Idea one' },
          { id: 'el2', type: 'text', text: 'Idea two', isDeleted: true },
          { id: 'el3', type: 'rectangle' },
          { id: 'el4', type: 'text', text: '   ' },
        ],
        appState: {},
        files: {},
      },
    });

    expect(result).toEqual({
      name: 'Brainstorm',
      attributes: 'Idea one',
    });
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
