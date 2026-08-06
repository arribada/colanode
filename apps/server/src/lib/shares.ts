// ABOUTME: Public share helpers — look up a share by token, check it is live,
import { sha256 } from 'js-sha256';
// ABOUTME: reconstruct a node's document, and render the shared page(s) to HTML.
import { randomBytes } from 'crypto';
import { Readable } from 'stream';

import { DocumentContent, FileStatus, NodeAttributes } from '@colanode/core';
import { YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import { SelectNodeShare } from '@colanode/server/data/schema';
import { fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';
import { createNotification } from '@colanode/server/lib/notifications';
import {
  renderDocumentHtml,
  renderSharePage,
} from '@colanode/server/lib/share-html';
import { storage } from '@colanode/server/lib/storage';

export const getShareByToken = async (
  token: string
): Promise<SelectNodeShare | undefined> =>
  database
    .selectFrom('node_shares')
    .selectAll()
    .where('token', '=', token)
    .executeTakeFirst();

// Deterministic per-share image key for password-protected shares. Derived
// from the (server-only) password hash + token, so it is unguessable without
// the password and is only ever handed out by /unlock AFTER the password is
// verified. A bare <img> request then carries it as ?k=. Revoke/expiry still
// gate every image request via isShareLive, so this never outlives the share.
export const getShareImageKey = (share: SelectNodeShare): string | null => {
  if (!share.password_hash) {
    return null;
  }
  return sha256(share.password_hash + ':' + share.token);
};

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

// Return the shared node's document content (blocks) + metadata as JSON, for
// the SPA public editor to render with the real editor.
export const getShareData = async (
  share: SelectNodeShare
): Promise<{
  name: string;
  permission: string;
  includeSubpages: boolean;
  workspaceName: string | null;
  content: DocumentContent;
  subPages: Array<{ id: string; name: string; content: DocumentContent }>;
  imageKey: string | null;
} | null> => {
  const node = await database
    .selectFrom('nodes')
    .selectAll()
    .where('id', '=', share.node_id)
    .executeTakeFirst();
  if (!node) {
    return null;
  }
  const content = await getDocumentContent(share.node_id);
  const workspace = await database
    .selectFrom('workspaces')
    .select(['name'])
    .where('id', '=', share.workspace_id)
    .executeTakeFirst();

  // Mirror renderShare: when the share includes sub-pages, return each direct
  // child page's document content so the SPA can render them below the main doc
  // (same page-vs-page+subpages toggle the owner chose at share time).
  const subPages: Array<{ id: string; name: string; content: DocumentContent }> =
    [];
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
      subPages.push({
        id: child.id,
        name: nodeName(child.attributes as NodeAttributes),
        content: childContent ?? { type: 'rich_text', blocks: {} },
      });
    }
  }

  return {
    name: nodeName(node.attributes as NodeAttributes),
    permission: share.permission,
    includeSubpages: share.include_subpages,
    workspaceName: workspace?.name ?? null,
    content: content ?? { type: 'rich_text', blocks: {} },
    subPages,
    imageKey: getShareImageKey(share),
  };
};

// Stream a file that is embedded in a shared page — but ONLY if the file lives
// inside the shared node's subtree. `fetchNodeTree(fileId)` returns the file's
// full ancestor chain (root -> ... -> file); if the shared node id is not in
// that chain, the file is outside what was shared and we refuse it. This is the
// only authorization: there is no account/role on a public request, so subtree
// containment is what scopes access and prevents leaking arbitrary files.
export const getShareFile = async (
  share: SelectNodeShare,
  fileId: string
): Promise<{ stream: Readable; contentType?: string } | null> => {
  const tree = await fetchNodeTree(fileId);
  if (tree.length === 0) {
    return null;
  }

  const nodes = tree.map((node) => mapNode(node));
  const file = nodes[nodes.length - 1];
  if (!file || file.id !== fileId || file.type !== 'file') {
    return null;
  }

  if (file.status !== FileStatus.Ready) {
    return null;
  }

  // Subtree authorization — the shared node must be the file itself or one of
  // its ancestors.
  if (!nodes.some((node) => node.id === share.node_id)) {
    return null;
  }

  const upload = await database
    .selectFrom('uploads')
    .selectAll()
    .where('file_id', '=', fileId)
    .executeTakeFirst();

  if (!upload || !upload.uploaded_at) {
    return null;
  }

  try {
    const { stream, contentType } = await storage.download(upload.path);
    return { stream, contentType: contentType ?? upload.mime_type };
  } catch {
    return null;
  }
};

// Store an external contributor's proposed edit as a pending suggestion.
// The legacy `share_suggestions` row (HTML, for the owner dialog's sandboxed
// preview) is always written so the existing flow is unchanged. When the SPA
// also sends structured `blocks`, a unified `document_suggestions` row (whole
// document) is written too, so the owner can Accept-and-apply in one click via
// the new Suggestions panel.
export const createSuggestion = async (
  share: SelectNodeShare,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    html: string;
    text: string;
    blocks?: Record<string, unknown> | null;
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

  // Unified apply path: only when the SPA supplied structured blocks.
  if (input.blocks && Object.keys(input.blocks).length > 0) {
    try {
      await database
        .insertInto('document_suggestions')
        .values({
          id: randomBytes(15).toString('hex'),
          workspace_id: share.workspace_id,
          node_id: share.node_id,
          block_id: null,
          scope: 'document',
          proposed_content: { type: 'rich_text', blocks: input.blocks },
          preview_text: input.text.slice(0, 2000),
          origin: 'external',
          author_id: null,
          author_name: `${input.firstName} ${input.lastName}`.trim(),
          author_email: input.email,
          status: 'pending',
          created_at: new Date(),
          resolved_at: null,
          resolved_by: null,
        })
        .execute();
    } catch {
      // the share_suggestions row already exists; the unified row is best-effort
    }
  }

  try {
    const node = await database
      .selectFrom('nodes')
      .select(['root_id'])
      .where('id', '=', share.node_id)
      .executeTakeFirst();
    if (node) {
      await createNotification({
        userId: share.created_by,
        workspaceId: share.workspace_id,
        rootId: node.root_id,
        type: 'share_suggestion',
        sourceNodeId: share.node_id,
        actorId: share.created_by,
        preview: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
        },
      });
    }
  } catch {
    // the suggestion is already stored; a failed notification must not fail it
  }
};
