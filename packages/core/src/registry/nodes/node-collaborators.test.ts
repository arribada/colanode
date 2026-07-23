import { describe, expect, it } from 'vitest';

import { Node, NodeAttributes } from '@colanode/core/registry/nodes';
import { databaseModel } from '@colanode/core/registry/nodes/database';
import { folderModel } from '@colanode/core/registry/nodes/folder';
import { pageModel } from '@colanode/core/registry/nodes/page';

const editor = { id: 'editor1', role: 'admin' } as never;
const admin = { id: 'admin1', role: 'admin' } as never;

const space = {
  id: 'space1',
  type: 'space',
  parentId: null,
  rootId: 'space1',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'admin1',
  updatedAt: null,
  updatedBy: null,
  name: 'Space',
  collaborators: { editor1: 'editor', admin1: 'admin' },
} as unknown as Node;

type Fixture = {
  name: string;
  before: Node;
  after: NodeAttributes;
  model: typeof pageModel;
};

const fixtures: Fixture[] = [
  {
    name: 'page',
    model: pageModel,
    before: {
      id: 'page1',
      type: 'page',
      parentId: 'space1',
      rootId: 'space1',
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'admin1',
      updatedAt: null,
      updatedBy: null,
      name: 'Page',
    } as unknown as Node,
    after: {
      type: 'page',
      name: 'Page renamed',
      parentId: 'space1',
    } as unknown as NodeAttributes,
  },
  {
    name: 'database',
    model: databaseModel,
    before: {
      id: 'db1',
      type: 'database',
      parentId: 'space1',
      rootId: 'space1',
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'admin1',
      updatedAt: null,
      updatedBy: null,
      name: 'Database',
      fields: {},
    } as unknown as Node,
    after: {
      type: 'database',
      name: 'Database renamed',
      parentId: 'space1',
      fields: {},
    } as unknown as NodeAttributes,
  },
  {
    name: 'folder',
    model: folderModel,
    before: {
      id: 'folder1',
      type: 'folder',
      parentId: 'space1',
      rootId: 'space1',
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'admin1',
      updatedAt: null,
      updatedBy: null,
      name: 'Folder',
    } as unknown as Node,
    after: {
      type: 'folder',
      name: 'Folder renamed',
      parentId: 'space1',
    } as unknown as NodeAttributes,
  },
];

describe.each(fixtures)(
  '$name node collaborators permission gating',
  ({ model, before, after }) => {
    it('allows an editor to update regular attributes', () => {
      const result = model.canUpdateAttributes({
        user: editor,
        tree: [space, before],
        node: before,
        attributes: after,
      } as never);

      expect(result).toBe(true);
    });

    it('rejects an editor adding node-level collaborators', () => {
      const attributesWithCollaborators = {
        ...after,
        collaborators: { newUser: 'viewer' },
      } as unknown as NodeAttributes;

      const result = model.canUpdateAttributes({
        user: editor,
        tree: [space, before],
        node: before,
        attributes: attributesWithCollaborators,
      } as never);

      expect(result).toBe(false);
    });

    it('allows an admin to add node-level collaborators', () => {
      const attributesWithCollaborators = {
        ...after,
        collaborators: { newUser: 'viewer' },
      } as unknown as NodeAttributes;

      const result = model.canUpdateAttributes({
        user: admin,
        tree: [space, before],
        node: before,
        attributes: attributesWithCollaborators,
      } as never);

      expect(result).toBe(true);
    });

    it('allows an admin to change an existing node-level collaborator role', () => {
      const nodeWithCollaborators = {
        ...before,
        collaborators: { newUser: 'viewer' },
      } as unknown as Node;
      const attributesWithChangedRole = {
        ...after,
        collaborators: { newUser: 'editor' },
      } as unknown as NodeAttributes;

      const result = model.canUpdateAttributes({
        user: admin,
        tree: [space, nodeWithCollaborators],
        node: nodeWithCollaborators,
        attributes: attributesWithChangedRole,
      } as never);

      expect(result).toBe(true);
    });
  }
);
