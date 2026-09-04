import { eq, useLiveQuery } from '@tanstack/react-db';
import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { useState } from 'react';

import { LocalPageNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { consumePagePendingRename } from '@colanode/ui/editor/views/page-pending-rename';

export const PageNodeView = ({ node }: NodeViewProps) => {
  const workspace = useWorkspace();

  const id = node.attrs.id;

  // A freshly created /page embed opens straight in rename mode so the page can
  // be named on the spot instead of staying "Untitled".
  const [renaming, setRenaming] = useState(() =>
    id ? consumePagePendingRename(id) : false
  );
  const [draft, setDraft] = useState('');

  const pageGetQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, id))
        .findOne(),
    [workspace.userId, id]
  );

  if (!id) {
    return null;
  }

  if (
    pageGetQuery.isLoading ||
    !pageGetQuery.data ||
    pageGetQuery.data.type !== 'page'
  ) {
    return null;
  }

  const page = pageGetQuery.data as LocalPageNode | undefined;
  if (!page) {
    return null;
  }

  const name = page.name ?? 'Unnamed';
  const avatar = page.avatar;

  const commitName = () => {
    const finalName = draft.trim() || 'Untitled';
    workspace.collections.nodes.update(id, (draft) => {
      if (draft.type === 'page') {
        draft.name = finalName;
      }
    });
    setRenaming(false);
  };

  if (renaming) {
    return (
      <NodeViewWrapper data-id={id} contentEditable={false}>
        <div className="my-0.5 flex h-10 w-full flex-row items-center gap-1 rounded-md border border-primary p-1">
          <Avatar
            size="small"
            id={id}
            name={draft || 'Page'}
            avatar={avatar}
          />
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- name the page right after creating it
            autoFocus
            value={draft}
            placeholder="Name this page…"
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitName();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            onBlur={commitName}
            className="grow bg-transparent text-sm outline-none"
          />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-id={node.attrs.id}>
      <Link from="/workspace/$userId" to="$nodeId" params={{ nodeId: id }}>
        <div className="my-0.5 flex h-10 w-full cursor-pointer flex-row items-center gap-1 rounded-md p-1 hover:bg-accent">
          <Avatar size="small" id={id} name={name} avatar={avatar} />
          <div role="presentation" className="grow">
            {name || 'Untitled'}
          </div>
        </div>
      </Link>
    </NodeViewWrapper>
  );
};
