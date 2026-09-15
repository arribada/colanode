import { describe, expect, it } from 'vitest';

import { database } from '@colanode/server/data/database';
import { uploadImage } from '@colanode/server/lib/ai/tools';
import { storage } from '@colanode/server/lib/storage';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

// A 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const readAll = async (stream: AsyncIterable<unknown>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    );
  }
  return Buffer.concat(chunks);
};

const seedPage = async () => {
  const account = await createAccount();
  const workspace = await createWorkspace({ createdBy: account.id });
  const user = await createUser({
    workspaceId: workspace.id,
    account,
    role: 'owner',
  });
  const spaceId = await createSpaceNode({
    workspaceId: workspace.id,
    userId: user.id,
  });
  const pageId = await createPageNode({
    workspaceId: workspace.id,
    userId: user.id,
    parentId: spaceId,
    rootId: spaceId,
  });

  return {
    ctx: { userId: user.id, workspaceId: workspace.id },
    pageId,
    spaceId,
  };
};

describe('uploadImage', () => {
  it('records the upload the download route needs, so the image can load', async () => {
    const { ctx, pageId, spaceId } = await seedPage();
    const result = await uploadImage(ctx, {
      pageId,
      name: 'dot',
      data: PNG_BASE64,
    });

    // The download route serves a file only through its uploads row. Without
    // it every agent upload answered 400, and the page sat on "Loading image…"
    // until the client gave up with "Couldn't load this image".
    const upload = await database
      .selectFrom('uploads')
      .selectAll()
      .where('file_id', '=', result.fileId)
      .executeTakeFirstOrThrow();
    expect(upload.uploaded_at).not.toBeNull();
    expect(upload.root_id).toBe(spaceId);
    expect(upload.mime_type).toBe('image/png');
    expect(Number(upload.size)).toBe(result.size);

    const { stream } = await storage.download(upload.path);
    const bytes = await readAll(stream);
    expect(bytes.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
  });

  it('stores only the cleaned copy of an SVG, and records its real size', async () => {
    const { ctx, pageId } = await seedPage();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="4" height="4"/></svg>';
    const result = await uploadImage(ctx, {
      pageId,
      name: 'diagram.svg',
      data: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    });

    const upload = await database
      .selectFrom('uploads')
      .selectAll()
      .where('file_id', '=', result.fileId)
      .executeTakeFirstOrThrow();
    const stored = (
      await readAll((await storage.download(upload.path)).stream)
    ).toString('utf8');

    expect(stored).toContain('<rect');
    expect(stored).not.toMatch(/script|alert/i);
    expect(Number(upload.size)).toBe(Buffer.byteLength(stored, 'utf8'));
  });
});
