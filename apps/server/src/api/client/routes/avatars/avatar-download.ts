import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { ApiErrorCode } from '@colanode/core';
import { toSafeLogFields } from '@colanode/server/api/client/lib/log-error';
import { createLogger } from '@colanode/server/lib/logger';
import { storage } from '@colanode/server/lib/storage';

const logger = createLogger('api:client:avatars:avatar-download');

export const avatarDownloadRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/:avatarId',
    schema: {
      params: z.object({
        avatarId: z.string(),
      }),
    },
    handler: async (request, reply) => {
      try {
        const avatarId = request.params.avatarId;
        const { stream } = await storage.download(`avatars/${avatarId}.jpeg`);

        reply.header('Content-Type', 'image/jpeg');
        return reply.send(stream);
      } catch (error) {
        logger.error(
          toSafeLogFields(error),
          `Failed to download avatar ${request.params.avatarId} from storage`
        );
        return reply.code(500).send({
          code: ApiErrorCode.AvatarDownloadFailed,
          message: 'Failed to download avatar',
        });
      }
    },
  });

  done();
};
