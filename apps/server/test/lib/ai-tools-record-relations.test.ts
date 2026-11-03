import { describe, expect, it } from 'vitest';

import {
  generateId,
  IdType,
  NodeAttributes,
  RecordAttributes,
} from '@colanode/core';
import { createRecord, updateRecord } from '@colanode/server/lib/ai/tools';
import { createNode, fetchNode } from '@colanode/server/lib/nodes';

import {
  createAccount,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

// Two databases linked both ways, like Requirements <-> Verification: a
// test's "Verifies" is its requirement's "Verified by".
const VERIFIED_BY = 'fverifiedby';
const VERIFIES = 'fverifies';

const seed = async () => {
  const account = await createAccount({ name: 'Ann' });
  const workspace = await createWorkspace({ createdBy: account.id });
  const user = await createUser({
    workspaceId: workspace.id,
    account,
    role: 'owner',
  });
  const space = await createSpaceNode({
    workspaceId: workspace.id,
    userId: user.id,
    name: 'Projects',
  });

  const requirements = generateId(IdType.Database);
  const verification = generateId(IdType.Database);
  const database = async (
    id: string,
    name: string,
    fieldId: string,
    fieldName: string,
    target: string,
    reverse: string
  ) => {
    const attributes: NodeAttributes = {
      type: 'database',
      name,
      parentId: space,
      fields: {
        [fieldId]: {
          id: fieldId,
          type: 'relation',
          name: fieldName,
          index: 'a0',
          databaseId: target,
          relatedFieldId: reverse,
        },
      },
    };
    const created = await createNode({
      nodeId: id,
      rootId: space,
      attributes,
      userId: user.id,
      workspaceId: workspace.id,
    });
    if (!created) throw new Error(`Failed to create ${name}`);
  };
  await database(
    requirements,
    'Requirements',
    VERIFIED_BY,
    'Verified by',
    verification,
    VERIFIES
  );
  await database(
    verification,
    'Verification',
    VERIFIES,
    'Verifies',
    requirements,
    VERIFIED_BY
  );

  return {
    ctx: { userId: user.id, workspaceId: workspace.id },
    requirements,
    verification,
  };
};

const relationOf = async (recordId: string, fieldId: string) => {
  const node = await fetchNode(recordId);
  const attributes = node?.attributes as RecordAttributes | undefined;
  const value = attributes?.fields?.[fieldId];
  return value && value.type === 'string_array' ? value.value : [];
};

describe('record tools and relation fields', () => {
  it('stores a relation given as record ids and shows it on the other side', async () => {
    const { ctx, requirements, verification } = await seed();
    const requirement = await createRecord(ctx, {
      databaseId: requirements,
      fields: { name: 'HW-1' },
    });
    const test = await createRecord(ctx, {
      databaseId: verification,
      fields: { name: 'PT-1', Verifies: [requirement.id] },
    });

    expect(test.applied).toContain('Verifies');
    expect(test.skipped).not.toContain('Verifies');
    expect(await relationOf(test.id, VERIFIES)).toEqual([requirement.id]);
    expect(await relationOf(requirement.id, VERIFIED_BY)).toEqual([test.id]);
  });

  it('removes the link on both sides when one side drops it', async () => {
    const { ctx, requirements, verification } = await seed();
    const requirement = await createRecord(ctx, {
      databaseId: requirements,
      fields: { name: 'HW-1' },
    });
    const test = await createRecord(ctx, {
      databaseId: verification,
      fields: { name: 'PT-1', Verifies: [requirement.id] },
    });

    await updateRecord(ctx, {
      recordId: requirement.id,
      fields: { 'Verified by': [] },
    });

    expect(await relationOf(requirement.id, VERIFIED_BY)).toEqual([]);
    expect(await relationOf(test.id, VERIFIES)).toEqual([]);
  });

  it('drops a value that is not a record id instead of storing it', async () => {
    const { ctx, requirements, verification } = await seed();
    const requirement = await createRecord(ctx, {
      databaseId: requirements,
      fields: { name: 'HW-1' },
    });
    const test = await createRecord(ctx, {
      databaseId: verification,
      fields: { name: 'PT-1', Verifies: [requirement.id, 'HW-1', ''] },
    });
    expect(await relationOf(test.id, VERIFIES)).toEqual([requirement.id]);
  });
});
