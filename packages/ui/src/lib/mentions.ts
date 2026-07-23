import { LocalNode } from '@colanode/client/types';

export type MentionNodeDisplay = {
  name: string;
  avatar: string | null | undefined;
  label: string;
};

// Display info for a node mentioned inline (@-mention with a node target).
// Falls back gracefully when the node is not (yet) in the local database.
export const getMentionNodeDisplay = (
  node: LocalNode | undefined | null
): MentionNodeDisplay => {
  if (!node) {
    return { name: 'Unknown', avatar: undefined, label: 'Node' };
  }

  switch (node.type) {
    case 'page':
      return {
        name: node.name ?? 'Unnamed',
        avatar: node.avatar,
        label: 'Page',
      };
    case 'database':
      return {
        name: node.name ?? 'Unnamed',
        avatar: node.avatar,
        label: 'Database',
      };
    case 'record':
      return {
        name: node.name ?? 'Unnamed',
        avatar: node.avatar,
        label: 'Record',
      };
    default: {
      const name =
        'name' in node && typeof node.name === 'string' && node.name.length > 0
          ? node.name
          : 'Unnamed';
      const avatar =
        'avatar' in node && typeof node.avatar === 'string'
          ? node.avatar
          : undefined;
      return { name, avatar, label: node.type };
    }
  }
};
