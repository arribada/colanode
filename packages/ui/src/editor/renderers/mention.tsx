import { eq, useLiveQuery } from '@tanstack/react-db';
import { JSONContent } from '@tiptap/core';

import { getIdType, IdType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { defaultClasses } from '@colanode/ui/editor/classes';
import { MentionSafeBoundary } from '@colanode/ui/editor/mention-safe-boundary';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

interface MentionRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

const MentionUserRenderer = ({ target }: { target: string }) => {
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
    <span className={defaultClasses.mention}>
      <Avatar size="small" id={target} name={name} avatar={avatar} />
      <span role="presentation">{name}</span>
    </span>
  );
};

const MentionNodeRenderer = ({ target }: { target: string }) => {
  const workspace = useWorkspace();

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
    <span className={defaultClasses.mention}>
      <Avatar size="small" id={target} name={name} avatar={avatar} />
      <span role="presentation">{name}</span>
    </span>
  );
};

export const MentionRenderer = ({ node }: MentionRendererProps) => {
  const target = node.attrs?.target as string | null | undefined;

  if (!target) {
    return (
      <span className={defaultClasses.mention}>
        <Avatar size="small" id="?" name="Unknown" />
        <span role="presentation">Unknown</span>
      </span>
    );
  }

  return (
    <MentionSafeBoundary>
      {getIdType(target) === IdType.User ? (
        <MentionUserRenderer target={target} />
      ) : (
        <MentionNodeRenderer target={target} />
      )}
    </MentionSafeBoundary>
  );
};
