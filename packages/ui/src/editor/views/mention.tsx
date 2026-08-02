import { eq, useLiveQuery } from '@tanstack/react-db';
import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { useNavigate } from '@tanstack/react-router';

import { getIdType, IdType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { defaultClasses } from '@colanode/ui/editor/classes';
import { MentionSafeBoundary } from '@colanode/ui/editor/mention-safe-boundary';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

const MentionUserChip = ({ target }: { target: string }) => {
  const workspace = useWorkspace();

  const userQuery = useLiveQuery(
    (q) =>
      q
        .from({ users: workspace.collections.users })
        .where(({ users }) => eq(users.id, target))
        .select(({ users }) => ({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        }))
        .findOne(),
    [workspace.userId, target]
  );

  const user = userQuery.data;
  const name = user?.name ?? 'Unknown';
  const avatar = user?.avatar;

  return (
    <>
      <Avatar size="small" id={target} name={name} avatar={avatar} />
      <span role="presentation">{name}</span>
    </>
  );
};

const MentionNodeChip = ({ target }: { target: string }) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();

  const nodeQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, target))
        .findOne(),
    [workspace.userId, target]
  );

  const { name, avatar } = getMentionNodeDisplay(nodeQuery.data);

  return (
    <Link
      from="/workspace/$userId"
      to="$nodeId"
      params={{ nodeId: target }}
      onClick={(e) => {
        // Shift-click opens the target as a modal over the current page;
        // Ctrl/Cmd-click falls through to the browser (new tab); a plain click
        // navigates in the same view (the Link default).
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          navigate({
            to: '/workspace/$userId/$nodeId/modal/$modalNodeId',
            params: (prev) => ({
              userId: prev.userId!,
              nodeId: prev.nodeId!,
              modalNodeId: target,
            }),
          });
        }
      }}
      className="inline-flex flex-row items-center gap-1 cursor-pointer hover:underline"
    >
      <Avatar size="small" id={target} name={name} avatar={avatar} />
      <span role="presentation">{name}</span>
    </Link>
  );
};

export const MentionNodeView = ({ node }: NodeViewProps) => {
  const target = node.attrs.target as string | null;
  const isUser = target ? getIdType(target) === IdType.User : true;

  if (!target) {
    return null;
  }

  return (
    <NodeViewWrapper data-id={node.attrs.id} className={defaultClasses.mention}>
      <MentionSafeBoundary>
        {isUser ? (
          <MentionUserChip target={target} />
        ) : (
          <MentionNodeChip target={target} />
        )}
      </MentionSafeBoundary>
    </NodeViewWrapper>
  );
};
