import { eq, useLiveQuery } from '@tanstack/react-db';
import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';

import { LocalFileNode } from '@colanode/client/types';
import { FileBlock } from '@colanode/ui/components/files/file-block';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { EditorImageBlock } from '@colanode/ui/editor/views/editor-image-block';

export const FileNodeView = (props: NodeViewProps) => {
  const id = props.node.attrs.id;
  if (!id) {
    return null;
  }

  return (
    // data-drag-handle wires the block for ProseMirror node dragging: the file
    // node spec is draggable, but tiptap only initiates a node drag (and sets
    // view.dragging, which the columns-drag plugin needs) when an element in the
    // view carries this attribute. Without it, grabbing an image started no drag
    // at all, so images could never be dropped into a column.
    <NodeViewWrapper data-drag-handle>
      <FileNodeInner {...props} id={id} />
    </NodeViewWrapper>
  );
};

const FileNodeInner = ({
  node,
  editor,
  getPos,
  updateAttributes,
  id,
}: NodeViewProps & { id: string }) => {
  const workspace = useWorkspace();

  const fileQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, id))
        .findOne(),
    [workspace.userId, id]
  );

  const file = fileQuery.data;

  // Images get the richer editor block (resizable + optional captioned figure);
  // everything else keeps the generic file preview block.
  if (file && file.type === 'file' && (file as LocalFileNode).subtype === 'image') {
    return (
      <EditorImageBlock
        file={file as LocalFileNode}
        node={node}
        editor={editor}
        getPos={getPos}
        updateAttributes={updateAttributes}
      />
    );
  }

  return <FileBlock id={id} />;
};
