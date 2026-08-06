// ABOUTME: Public JSON API for the SPA share editor — fetch a share's document
// ABOUTME: blocks (with optional password unlock) and submit a suggestion.
import { FastifyPluginCallback } from 'fastify';

import { verifyPassword } from '@colanode/server/lib/accounts';
import {
  createSuggestion,
  getShareByToken,
  getShareData,
  isShareLive,
} from '@colanode/server/lib/shares';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const shareApiRoute: FastifyPluginCallback = (instance, _, done) => {
  instance.get('/share-api/:token/data', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const share = await getShareByToken(token);
    if (!share || !isShareLive(share)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (share.password_hash) {
      return { locked: true };
    }
    const data = await getShareData(share);
    if (!data) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return data;
  });

  instance.post('/share-api/:token/unlock', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const body = (request.body ?? {}) as { password?: string };
    const share = await getShareByToken(token);
    if (!share || !isShareLive(share)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (share.password_hash) {
      const ok = body.password
        ? await verifyPassword(body.password, share.password_hash)
        : false;
      if (!ok) {
        return reply.code(401).send({ error: 'password' });
      }
    }
    const data = await getShareData(share);
    if (!data) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return data;
  });

  instance.post('/share-api/:token/suggest', async (request, reply) => {
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
