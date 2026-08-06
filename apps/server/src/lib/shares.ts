// ABOUTME: Public share helpers — look up a share by token, check it is live,
// ABOUTME: reconstruct a node's document, and render the shared page(s) to HTML.
import { randomBytes } from 'crypto';

import { DocumentContent, NodeAttributes } from '@colanode/core';
import { YDoc } from '@colanode/crdt';

import { database } from '@colanode/server/data/database';
import { SelectNodeShare } from '@colanode/server/data/schema';
import {
  renderDocumentHtml,
  renderSharePage,
} from '@colanode/server/lib/share-html';

export const getShareByToken = async (
  token: string
): Promise<SelectNodeShare | undefined> =>
  database
    .selectFrom('node_shares')
    .selectAll()
    .where('token', '=', token)
    .executeTakeFirst();

export const isShareLive = (share: SelectNodeShare): boolean => {
  if (share.revoked_at) {
    return false;
  }
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return false;
  }
  return true;
};

const getDocumentContent = async (
  nodeId: string
): Promise<DocumentContent | null> => {
  const updates = await database
    .selectFrom('document_updates')
    .selectAll()
    .where('document_id', '=', nodeId)
    .orderBy('id', 'asc')
    .execute();

  if (updates.length === 0) {
    return null;
  }

  const ydoc = new YDoc();
  for (const update of updates) {
    ydoc.applyUpdate(update.data);
  }
  return ydoc.getObject<DocumentContent>();
};

const nodeName = (attributes: NodeAttributes): string => {
  const name = (attributes as { name?: string }).name;
  return name && name.trim().length > 0 ? name : 'Untitled';
};

// Render the shared node (and, when enabled, its direct sub-pages) to a full
// standalone HTML page.
export const renderShare = async (
  share: SelectNodeShare
): Promise<string | null> => {
  const node = await database
    .selectFrom('nodes')
    .selectAll()
    .where('id', '=', share.node_id)
    .executeTakeFirst();

  if (!node) {
    return null;
  }

  const attributes = node.attributes as NodeAttributes;
  const title = nodeName(attributes);

  const content = await getDocumentContent(share.node_id);
  let body = renderDocumentHtml(share.node_id, content);

  if (share.include_subpages) {
    const children = await database
      .selectFrom('nodes')
      .selectAll()
      .where('parent_id', '=', share.node_id)
      .execute();

    const pages = children.filter(
      (c) => (c.attributes as NodeAttributes).type === 'page'
    );

    for (const child of pages) {
      const childContent = await getDocumentContent(child.id);
      const childHtml = renderDocumentHtml(child.id, childContent);
      const childTitle = nodeName(child.attributes as NodeAttributes);
      body +=
        `<hr /><h2>${childTitle
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</h2>` + childHtml;
    }
  }

  const workspace = await database
    .selectFrom('workspaces')
    .select(['name'])
    .where('id', '=', share.workspace_id)
    .executeTakeFirst();

  return renderSharePage({
    title,
    bodyHtml: body,
    workspaceName: workspace?.name,
    suggest:
      share.permission === 'suggest' ? { token: share.token } : undefined,
  });
};

// Store an external contributor's proposed edit as a pending suggestion.
export const createSuggestion = async (
  share: SelectNodeShare,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    html: string;
    text: string;
  }
): Promise<void> => {
  await database
    .insertInto('share_suggestions')
    .values({
      id: randomBytes(15).toString('hex'),
      share_id: share.id,
      node_id: share.node_id,
      workspace_id: share.workspace_id,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      proposed_html: input.html,
      proposed_text: input.text,
      status: 'pending',
      created_at: new Date(),
    })
    .execute();
};
