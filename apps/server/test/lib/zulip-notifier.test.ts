import { afterEach, describe, expect, it } from 'vitest';

import { generateId, IdType } from '@colanode/core';
import { config } from '@colanode/server/lib/config';
import { createNode } from '@colanode/server/lib/nodes';
import { buildZulipMessage } from '@colanode/server/lib/zulip/notifier';

import {
  createAccount,
  createWorkspace,
  createUser,
  createSpaceNode,
  createChannelNode,
  createMessageNode,
} from '../helpers/seed';

describe('buildZulipMessage', () => {
  afterEach(() => {
    config.web = undefined;
  });

  it('builds a mention message naming the actor and linking to the root, with a content snippet', async () => {
    const actorAccount = await createAccount({ name: 'Ada Lovelace' });
    const recipientAccount = await createAccount();
    const workspace = await createWorkspace({ createdBy: actorAccount.id });
    const actor = await createUser({
      workspaceId: workspace.id,
      account: actorAccount,
      role: 'collaborator',
    });
    const recipient = await createUser({
      workspaceId: workspace.id,
      account: recipientAccount,
      role: 'collaborator',
    });

    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: actor.id,
      name: 'Engineering',
      collaborators: { [recipient.id]: 'collaborator' },
    });
    const channelId = await createChannelNode({
      workspaceId: workspace.id,
      userId: actor.id,
      parentId: spaceId,
      rootId: spaceId,
    });
    const messageId = await createMessageNode({
      workspaceId: workspace.id,
      userId: actor.id,
      rootId: spaceId,
      parentId: channelId,
      mentionUserId: recipient.id,
    });

    config.web = { domain: 'colanode.example.com', protocol: 'https' };

    const result = await buildZulipMessage({
      userId: recipient.id,
      workspaceId: workspace.id,
      rootId: spaceId,
      type: 'mention',
      sourceNodeId: messageId,
      actorId: actor.id,
    });

    expect(result.topic).toBe('Engineering');
    expect(result.content).toContain('Ada Lovelace');
    expect(result.content).toContain('mentioned you');
    expect(result.content).toContain(
      `[Engineering](https://colanode.example.com/workspace/${recipient.id}/${spaceId})`
    );
  });

  it('falls back to a generic actor/topic and skips the link when the root/actor cannot be resolved', async () => {
    config.web = undefined;

    const result = await buildZulipMessage({
      userId: generateId(IdType.User),
      workspaceId: generateId(IdType.Workspace),
      rootId: generateId(IdType.Space),
      type: 'direct_message',
      sourceNodeId: generateId(IdType.Message),
      actorId: null,
    });

    expect(result.topic).toBe('Colanode');
    expect(result.content).toBe('**Someone** sent you a message in Colanode');
  });

  it('truncates long content snippets', async () => {
    const actorAccount = await createAccount();
    const workspace = await createWorkspace({ createdBy: actorAccount.id });
    const actor = await createUser({
      workspaceId: workspace.id,
      account: actorAccount,
      role: 'collaborator',
    });

    const spaceId = await createSpaceNode({
      workspaceId: workspace.id,
      userId: actor.id,
    });
    const channelId = await createChannelNode({
      workspaceId: workspace.id,
      userId: actor.id,
      parentId: spaceId,
      rootId: spaceId,
    });

    const longText = 'a'.repeat(300);
    const blockId = generateId(IdType.Block);
    const messageId = generateId(IdType.Message);

    await createNode({
      nodeId: messageId,
      rootId: spaceId,
      userId: actor.id,
      workspaceId: workspace.id,
      attributes: {
        type: 'message',
        subtype: 'standard',
        parentId: channelId,
        content: {
          [blockId]: {
            id: blockId,
            type: 'paragraph',
            parentId: messageId,
            index: 'a0',
            content: [{ type: 'text', text: longText }],
          },
        },
      },
    });

    const result = await buildZulipMessage({
      userId: generateId(IdType.User),
      workspaceId: workspace.id,
      rootId: spaceId,
      type: 'direct_message',
      sourceNodeId: messageId,
      actorId: actor.id,
    });

    expect(result.content).toContain('a'.repeat(160) + '…');
    expect(result.content).not.toContain('a'.repeat(161));
  });
});
