import ky from 'ky';

import { config } from '@colanode/server/lib/config';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('zulip-client');

const ZulipRequestTimeout = 1000 * 10;

export type ZulipMessage = {
  // Zulip topics are capped at 60 chars server-side; callers should already
  // trim, but we don't re-validate here.
  topic: string;
  content: string;
};

// Posts a single message to the configured Zulip stream via the bot REST
// API (https://zulip.com/api/send-message). Silently no-ops when the
// integration is disabled so callers don't need to re-check the flag.
// Network/API errors are logged and swallowed — a down/misconfigured Zulip
// instance must never fail the Colanode notification it's mirroring.
export const sendZulipMessage = async (message: ZulipMessage): Promise<void> => {
  if (!config.zulip.enabled) {
    return;
  }

  const { site, botEmail, apiKey, stream } = config.zulip;
  const endpoint = `${site.replace(/\/+$/, '')}/api/v1/messages`;
  const auth = Buffer.from(`${botEmail}:${apiKey}`).toString('base64');
  const body = new URLSearchParams({
    type: 'stream',
    to: stream,
    topic: message.topic,
    content: message.content,
  });

  try {
    await ky.post(endpoint, {
      timeout: ZulipRequestTimeout,
      headers: {
        Authorization: `Basic ${auth}`,
      },
      body,
    });
  } catch (error) {
    logger.error(error, 'Zulip message POST failed');
  }
};
