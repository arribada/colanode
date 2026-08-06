// ABOUTME: Public (unauthenticated) share page route — GET renders the shared
// ABOUTME: node, POST unlocks a password-protected share. Mounted at the root.
import { FastifyPluginCallback, FastifyReply } from 'fastify';

import { verifyPassword } from '@colanode/server/lib/accounts';
import { renderPasswordPage } from '@colanode/server/lib/share-html';
import {
  getShareByToken,
  isShareLive,
  renderShare,
} from '@colanode/server/lib/shares';

const notFound = (reply: FastifyReply) =>
  reply
    .code(404)
    .type('text/html')
    .send(
      '<!doctype html><meta charset="utf-8"><title>Not found</title>' +
        '<body style="font-family:system-ui;text-align:center;padding:20vh">' +
        '<h1>404</h1><p>This shared page does not exist, was revoked, or expired.</p></body>'
    );

export const publicShareRoute: FastifyPluginCallback = (instance, _, done) => {
  instance.get('/share/:token', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const share = await getShareByToken(token);
    if (!share || !isShareLive(share)) {
      return notFound(reply);
    }
    if (share.password_hash) {
      return reply.type('text/html').send(renderPasswordPage({ token }));
    }
    const html = await renderShare(share);
    if (!html) {
      return notFound(reply);
    }
    return reply.type('text/html').send(html);
  });

  instance.post('/share/:token', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const body = (request.body ?? {}) as { password?: string };
    const share = await getShareByToken(token);
    if (!share || !isShareLive(share)) {
      return notFound(reply);
    }
    if (share.password_hash) {
      const ok = body.password
        ? await verifyPassword(body.password, share.password_hash)
        : false;
      if (!ok) {
        return reply
          .type('text/html')
          .send(renderPasswordPage({ token, error: true }));
      }
    }
    const html = await renderShare(share);
    if (!html) {
      return notFound(reply);
    }
    return reply.type('text/html').send(html);
  });

  done();
};
