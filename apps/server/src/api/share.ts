// ABOUTME: Public (unauthenticated) share page route — GET renders the shared
// ABOUTME: node, POST unlocks a password-protected share. Mounted at the root.
import { FastifyPluginCallback, FastifyReply } from 'fastify';

import { verifyPassword } from '@colanode/server/lib/accounts';
import { renderPasswordPage } from '@colanode/server/lib/share-html';
import {
  createSuggestion,
  getShareByToken,
  isShareLive,
  renderShare,
} from '@colanode/server/lib/shares';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

  // Phase 2: submit a proposed edit (with the contributor's identity) as a
  // pending suggestion. Only for shares that allow suggestions.
  instance.post('/share/:token/suggest', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const body = (request.body ?? {}) as {
      firstName?: string;
      lastName?: string;
      email?: string;
      html?: string;
      text?: string;
    };

    const share = await getShareByToken(token);
    if (!share || !isShareLive(share) || share.permission !== 'suggest') {
      return reply.code(404).send({ success: false });
    }

    const firstName = (body.firstName ?? '').trim();
    const lastName = (body.lastName ?? '').trim();
    const email = (body.email ?? '').trim();
    const html = body.html ?? '';
    if (
      !firstName ||
      !lastName ||
      !EMAIL_RE.test(email) ||
      html.length === 0 ||
      html.length > 500000
    ) {
      return reply.code(400).send({ success: false });
    }

    await createSuggestion(share, {
      firstName: firstName.slice(0, 120),
      lastName: lastName.slice(0, 120),
      email: email.slice(0, 255),
      html,
      text: (body.text ?? '').slice(0, 100000),
    });

    return { success: true };
  });

  done();
};
