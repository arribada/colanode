import { eq, useLiveQuery } from '@tanstack/react-db';
import { type NodeViewProps } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { NodeViewWrapper } from '@tiptap/react';
import { type DragEvent } from 'react';

import { LocalFileNode } from '@colanode/client/types';
import { FileBlock } from '@colanode/ui/components/files/file-block';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { EditorImageBlock } from '@colanode/ui/editor/views/editor-image-block';

export const FileNodeView = (props: NodeViewProps) => {
  const id = props.node.attrs.id;
  const { editor, getPos } = props;

  // Start a real ProseMirror node drag when the block is grabbed, the same way
  // the block action-menu handle does: select the node and put its slice on
  // view.dragging. The columns-drag plugin reads view.dragging to offer a side
  // drop, so without this, grabbing an image/file started no usable drag and it
  // could never be dropped into a column. (data-drag-handle alone did not
  // reliably initiate the drag for this node view.)
  const handleDragStart = (event: DragEvent) => {
    // Grabbing the image resize handle must resize the image, not start a node
    // drag -- this node is a draggable atom, so the drag would otherwise hijack
    // the resize. Cancel the drag when it begins on the handle.
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('.cn-img-resize-handle')) {
      event.preventDefault();
      return;
    }
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null) {
      return;
    }
    const { view } = editor;
    const selection = NodeSelection.create(view.state.doc, pos);
    view.dispatch(view.state.tr.setSelection(selection));
    const slice = view.state.selection.content();
    const { dom, text } = view.serializeForClipboard(slice);
    event.dataTransfer.clearData();
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/html', dom.innerHTML);
    event.dataTransfer.setData('text/plain', text);
    view.dragging = { slice, move: true };
  };

  if (!id) {
    return null;
  }

  return (
    <NodeViewWrapper draggable data-drag-handle onDragStart={handleDragStart}>
      <FileNodeInner {...props} id={id} />
    </NodeViewWrapper>
  );
};

const FileNodeInner = ({
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
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
        selected={selected}
      />
    );
  }

  return <FileBlock id={id} />;
};
