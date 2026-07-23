import { LocalNode, LocalSpaceNode } from '@colanode/client/types';
import { compareString, generateFractionalIndex } from '@colanode/core';

export const sortSpaceChildren = (
  space: LocalSpaceNode,
  children: LocalNode[]
) => {
  const sortedById = children.toSorted((a, b) => compareString(a.id, b.id));
  const indexes: Record<string, string> = {};
  const childrenSettings = space.children ?? {};
  let lastIndex: string | null = null;

  for (const child of sortedById) {
    lastIndex = generateFractionalIndex(lastIndex, null);
    const customIndex = childrenSettings[child.id]?.index;
    indexes[child.id] = customIndex ?? lastIndex;
  }

  return sortedById.sort((a, b) => {
    const aIndex = indexes[a.id];
    const bIndex = indexes[b.id];
    return compareString(aIndex, bIndex);
  });
};

const SPACE_CHILD_TYPE_ORDER = [
  'channel',
  'page',
  'whiteboard',
  'database',
  'folder',
];

const SPACE_CHILD_TYPE_LABELS: Record<string, string> = {
  channel: 'Channels',
  page: 'Pages',
  whiteboard: 'Whiteboards',
  database: 'Databases',
  folder: 'Folders',
};

export interface SpaceChildGroup {
  type: string;
  label: string;
  items: LocalNode[];
}

export const groupSpaceChildrenByType = (
  children: LocalNode[]
): SpaceChildGroup[] => {
  const byType = new Map<string, LocalNode[]>();
  for (const child of children) {
    const list = byType.get(child.type);
    if (list) {
      list.push(child);
    } else {
      byType.set(child.type, [child]);
    }
  }

  const groups: SpaceChildGroup[] = [];
  for (const type of SPACE_CHILD_TYPE_ORDER) {
    const items = byType.get(type);
    if (items && items.length > 0) {
      groups.push({ type, label: SPACE_CHILD_TYPE_LABELS[type] ?? type, items });
    }
    byType.delete(type);
  }
  for (const [type, items] of byType) {
    if (items.length > 0) {
      groups.push({
        type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        items,
      });
    }
  }
  return groups;
};
