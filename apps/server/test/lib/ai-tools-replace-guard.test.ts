import { describe, expect, it } from 'vitest';

import {
  editPage,
  getPage,
  wikiToolDefinitions,
} from '@colanode/server/lib/ai/tools';
import { createDocument } from '@colanode/server/lib/documents';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

// A page with a table column widened in the editor. Markdown has no way to
// write a column width, so a replace would reset it.
const seedPage = async () => {
  const account = await createAccount({ name: 'Alice' });
  const workspace = await createWorkspace({ createdBy: account.id });
  const user = await createUser({
    workspaceId: workspace.id,
    account,
    role: 'owner',
  });
  const space = await createSpaceNode({
    workspaceId: workspace.id,
    userId: user.id,
  });
  const page = await createPageNode({
    workspaceId: workspace.id,
    userId: user.id,
    parentId: space,
    rootId: space,
    name: 'Review',
  });
  await createDocument({
    nodeId: page,
    content: {
      type: 'rich_text',
      blocks: {
        p0: {
          id: 'p0',
          type: 'paragraph',
          parentId: page,
          index: 'a0',
          content: [{ type: 'text', text: 'Before the table.' }],
        },
        t: {
          id: 't',
          type: 'table',
          parentId: page,
          index: 'a1',
          attrs: { colorRules: [] },
        },
        r0: { id: 'r0', type: 'tableRow', parentId: 't', index: 'a0' },
        h0: {
          id: 'h0',
          type: 'tableHeader',
          parentId: 'r0',
          index: 'a0',
          attrs: { colspan: 1, rowspan: 1, backgroundColor: 'red' },
        },
        h0p: {
          id: 'h0p',
          type: 'paragraph',
          parentId: 'h0',
          index: 'a0',
          content: [{ type: 'text', text: 'Pin' }],
        },
      },
    },
    userId: user.id,
    workspaceId: workspace.id,
  });
  return { page, ctx: { userId: user.id, workspaceId: workspace.id } };
};

describe('replace guard', () => {
  it('names on get_page what a replace would delete', async () => {
    const { page, ctx } = await seedPage();
    const read = await getPage(ctx, { id: page });
    expect(read.lossyOnReplace).toEqual(['table cell colours']);
  });

  it('refuses a replace that would delete it, and leaves the page alone', async () => {
    const { page, ctx } = await seedPage();
    const read = await getPage(ctx, { id: page });

    await expect(
      editPage(ctx, {
        id: page,
        mode: 'replace',
        content: `${read.content}\n\nAdded.`,
      })
    ).rejects.toThrow(/table cell colours.*force: true/s);

    const after = await getPage(ctx, { id: page });
    expect(after.content).toBe(read.content);
    expect(after.lossyOnReplace).toEqual(['table cell colours']);
  });

  it('appends without asking', async () => {
    const { page, ctx } = await seedPage();
    await editPage(ctx, { id: page, mode: 'append', content: 'Appended.' });
    const after = await getPage(ctx, { id: page });
    expect(after.content).toContain('Appended.');
    expect(after.lossyOnReplace).toEqual(['table cell colours']);
  });

  it('replaces when the tool is told to with force, and then without it', async () => {
    const { page, ctx } = await seedPage();
    const editTool = wikiToolDefinitions.find(
      (definition) => definition.name === 'edit_page'
    )!;

    // Through the tool, so the input schema has to let force through.
    await editTool.run(ctx, {
      id: page,
      mode: 'replace',
      content: 'Only this now.',
      force: true,
    });
    const replaced = await getPage(ctx, { id: page });
    expect(replaced.content).toBe('Only this now.');
    expect(replaced.lossyOnReplace).toEqual([]);

    await editTool.run(ctx, {
      id: page,
      mode: 'replace',
      content: 'Plainer.',
    });
    expect((await getPage(ctx, { id: page })).content).toBe('Plainer.');
  });
});
