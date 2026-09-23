// ABOUTME: Turns a flat list of space nodes into the ordered page tree the move
// ABOUTME: dialog shows, and matches it against what is typed in the search box.

export interface MoveTreeInput {
  id: string;
  type: string;
  name?: string | null;
  parentId?: string | null;
}

export interface MoveTarget {
  id: string;
  name: string;
  parentId: string | null;
  // Nesting level under the space root, 0 for a top-level page.
  depth: number;
  hasChildren: boolean;
  // Ancestor names from the space root down to the parent, used to tell two
  // pages with the same name apart in the search results.
  path: string[];
}

const byName = (a: MoveTreeInput, b: MoveTreeInput) =>
  (a.name ?? '').localeCompare(b.name ?? '', undefined, {
    sensitivity: 'base',
  });

// Depth-first, siblings in name order: the same order the sidebar shows, so
// the dialog reads like the tree people already know.
export const buildMoveTargets = (
  nodes: MoveTreeInput[],
  rootId: string,
  excluded: Set<string>
): MoveTarget[] => {
  const pages = nodes.filter(
    (node) => node.type === 'page' && !excluded.has(node.id)
  );

  const byParent = new Map<string, MoveTreeInput[]>();
  const known = new Set(pages.map((page) => page.id));
  for (const page of pages) {
    // A page whose parent is gone from this space (moved, trashed, or simply
    // not synced yet) would vanish from the dialog with no way to pick it, so
    // it is shown at the top level instead of dropped.
    const parentId =
      page.parentId && known.has(page.parentId) ? page.parentId : rootId;
    const siblings = byParent.get(parentId);
    if (siblings) {
      siblings.push(page);
    } else {
      byParent.set(parentId, [page]);
    }
  }

  const targets: MoveTarget[] = [];
  const walk = (parentId: string, depth: number, path: string[]) => {
    const children = byParent.get(parentId);
    if (!children) {
      return;
    }

    for (const child of [...children].sort(byName)) {
      const name = child.name ?? 'Untitled';
      targets.push({
        id: child.id,
        name,
        parentId,
        depth,
        hasChildren: (byParent.get(child.id) ?? []).length > 0,
        path,
      });
      walk(child.id, depth + 1, [...path, name]);
    }
  };

  walk(rootId, 0, []);
  return targets;
};

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Every word has to appear somewhere in the page's name or in its path, so
// "cyprus noise" finds "Noise tests" under "Cyprus" without knowing the order.
export const matchMoveTargets = (
  targets: MoveTarget[],
  query: string
): MoveTarget[] => {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return targets;
  }

  return targets.filter((target) => {
    const haystack = normalize([...target.path, target.name].join(' '));
    return words.every((word) => haystack.includes(word));
  });
};

// The ids that must stay open for every one of these targets to be visible.
export const ancestorsOf = (
  targets: MoveTarget[],
  byId: Map<string, MoveTarget>
): Set<string> => {
  const open = new Set<string>();
  for (const target of targets) {
    let parentId = target.parentId;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent || open.has(parent.id)) {
        break;
      }
      open.add(parent.id);
      parentId = parent.parentId;
    }
  }
  return open;
};
