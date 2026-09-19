import { describe, expect, it } from 'vitest';

import { shouldIgnoreEventPath } from '@colanode/ui/lib/dnd-backend';

// An element as the path shows it: only its classes matter.
const el = (...classes: string[]) =>
  ({
    classList: { contains: (name: string) => classes.includes(name) },
  }) as unknown as EventTarget;
const windowLike = {} as EventTarget;

describe('shouldIgnoreEventPath', () => {
  it('leaves events inside the editor to the editor', () => {
    expect(
      shouldIgnoreEventPath([
        el('figure'),
        el('ProseMirror'),
        el('app'),
        windowLike,
      ])
    ).toBe(true);
  });

  it('still leaves a drop to the editor once its target was replaced', () => {
    // The path is fixed at dispatch: the replaced target still sits under the
    // editor in it, even though it is no longer in the document.
    const detachedTarget = el('react-renderer', 'node-file');
    expect(
      shouldIgnoreEventPath([detachedTarget, el('ProseMirror'), windowLike])
    ).toBe(true);
  });

  it('hands embedded database views to react-dnd', () => {
    expect(
      shouldIgnoreEventPath([
        el('row'),
        el('react-renderer', 'node-database'),
        el('ProseMirror'),
        windowLike,
      ])
    ).toBe(false);
  });

  it('hands everything outside the editor to react-dnd', () => {
    expect(
      shouldIgnoreEventPath([el('sidebar-item'), el('app'), windowLike])
    ).toBe(false);
  });
});
