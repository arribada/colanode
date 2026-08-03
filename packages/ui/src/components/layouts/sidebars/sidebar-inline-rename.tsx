// ABOUTME: Reusable inline rename for sidebar tree nodes — a hook that commits
// ABOUTME: the new name through the nodes collection, plus the little edit field.
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { LocalNode } from '@colanode/client/types';
import { useNodeUndo } from '@colanode/ui/contexts/node-undo';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

// Every renamable tree node (page, folder, database, whiteboard, …) carries a
// `name` string in its attributes, so we can commit through the same nodes
// collection the update dialog uses — no extra mutation needed.
export const useInlineRename = (node: LocalNode) => {
  const workspace = useWorkspace();
  const { push: pushUndo } = useNodeUndo();
  const [isRenaming, setIsRenaming] = useState(false);

  const currentName = 'name' in node ? (node.name ?? '') : '';

  const commitRenaming = (value: string) => {
    setIsRenaming(false);
    const name = value.trim();
    if (name.length === 0 || name === currentName) {
      return;
    }
    const nodes = workspace.collections.nodes;
    if (!nodes.has(node.id)) {
      return;
    }
    const previousName = currentName;
    nodes.update(node.id, (draft) => {
      if ('name' in draft) {
        draft.name = name;
      }
    });

    // Local-first collection write: the optimistic update applies immediately,
    // so replaying the previous name is a safe inverse.
    const revert = () => {
      if (!nodes.has(node.id)) {
        return;
      }
      nodes.update(node.id, (draft) => {
        if ('name' in draft) {
          draft.name = previousName;
        }
      });
    };
    pushUndo(revert);
    toast(`Renamed to "${name}"`, {
      action: {
        label: 'Undo',
        onClick: revert,
      },
    });
  };

  return {
    isRenaming,
    startRenaming: () => setIsRenaming(true),
    cancelRenaming: () => setIsRenaming(false),
    commitRenaming,
  };
};

interface InlineRenameFieldProps {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

// A single-line editor that sits inside the sidebar row. It stops its own
// clicks/keys from reaching the surrounding Link (navigation) and drag source.
export const InlineRenameField = ({
  initialValue,
  onCommit,
  onCancel,
}: InlineRenameFieldProps) => {
  const ref = useRef<HTMLInputElement>(null);
  // Enter and Escape both flip isRenaming, which unmounts this input, and React
  // fires blur on unmount. Without this guard that blur would re-run onCommit --
  // re-saving after Enter and, worse, SAVING the value after Escape (a cancel).
  const skipBlurRef = useRef(false);

  useEffect(() => {
    const input = ref.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }, []);

  return (
    <input
      ref={ref}
      defaultValue={initialValue}
      draggable={false}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          skipBlurRef.current = true;
          onCommit(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          skipBlurRef.current = true;
          onCancel();
        }
      }}
      onBlur={(e) => {
        // The commit/cancel above already resolved this edit; the blur React
        // fires as the input unmounts must not run a second, unwanted commit.
        if (skipBlurRef.current) {
          skipBlurRef.current = false;
          return;
        }
        onCommit(e.currentTarget.value);
      }}
      className="h-5 w-full min-w-0 grow rounded-sm bg-background px-1 text-sm text-foreground outline-none ring-1 ring-sidebar-ring"
    />
  );
};
