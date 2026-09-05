import { describe, expect, it } from 'vitest';

import { LocalNode } from '@colanode/client/types';

import { buildNodeCollaborators, collectDescendantIds } from './nodes';

const node = (id: string, parentId: string): LocalNode =>
  ({ id, parentId }) as LocalNode;

const nodeWithCollaborators = (
  id: string,
  parentId: string,
  collaborators: Record<string, string>
): LocalNode => ({ id, parentId, collaborators }) as unknown as LocalNode;

describe('collectDescendantIds', () => {
  it('collects direct and transitive descendants, excluding the root', () => {
    const nodes = [
      node('a', 'space'),
      node('b', 'a'),
      node('c', 'b'),
      node('d', 'a'),
    ];
    expect(collectDescendantIds('a', nodes)).toEqual(new Set(['b', 'c', 'd']));
  });

  it('returns empty for a leaf', () => {
    const nodes = [node('a', 'space'), node('b', 'a')];
    expect(collectDescendantIds('b', nodes)).toEqual(new Set());
  });

  it('ignores unrelated subtrees', () => {
    const nodes = [node('a', 'space'), node('x', 'space'), node('y', 'x')];
    expect(collectDescendantIds('a', nodes)).toEqual(new Set());
  });
});

describe('buildNodeCollaborators', () => {
  it('flattens collaborators from multiple node levels, tagging the origin nodeId', () => {
    const space = nodeWithCollaborators('space1', 'workspace', {
      user1: 'admin',
    });
    const page = nodeWithCollaborators('page1', 'space1', {
      user2: 'viewer',
    });

    const collaborators = buildNodeCollaborators([space, page]);

    expect(collaborators).toEqual(
      expect.arrayContaining([
        { nodeId: 'space1', collaboratorId: 'user1', role: 'admin' },
        { nodeId: 'page1', collaboratorId: 'user2', role: 'viewer' },
      ])
    );
  });

  it('preserves a grant for the same collaborator on every node level', () => {
    const space = nodeWithCollaborators('space1', 'workspace', {
      user1: 'viewer',
    });
    const page = nodeWithCollaborators('page1', 'space1', {
      user1: 'editor',
    });

    const collaborators = buildNodeCollaborators([space, page]);

    expect(collaborators).toEqual(
      expect.arrayContaining([
        { nodeId: 'space1', collaboratorId: 'user1', role: 'viewer' },
        { nodeId: 'page1', collaboratorId: 'user1', role: 'editor' },
      ])
    );
    // the most-specific (direct) grant is still resolvable per node
    const pageEntry = collaborators.find(
      (c) => c.nodeId === 'page1' && c.collaboratorId === 'user1'
    );
    expect(pageEntry?.role).toEqual('editor');
  });
});
