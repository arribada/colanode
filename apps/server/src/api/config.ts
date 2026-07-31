import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';

import {
  build,
  ServerConfig,
  ServerOidcConfig,
  serverConfigSchema,
} from '@colanode/core';
import { toSafeLogFields } from '@colanode/server/api/client/lib/log-error';
import { config } from '@colanode/server/lib/config';
import { createLogger } from '@colanode/server/lib/logger';
import { buildOidcAuthorizeUrl, resolveOidcEndpoints } from '@colanode/server/lib/oidc';

const logger = createLogger('api:client:config');

export const configGetRoute: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'GET',
    url: '/config',
    schema: {
      response: {
        200: serverConfigSchema,
      },
    },
    handler: async (request) => {
      let oidc: ServerOidcConfig = { enabled: false };

      if (config.account.oidc.enabled) {
        try {
          const endpoints = await resolveOidcEndpoints(config.account.oidc);
          oidc = {
            enabled: true,
            authorizeUrl: buildOidcAuthorizeUrl(
              config.account.oidc,
              endpoints.authorizationUrl
            ),
            buttonLabel: config.account.oidc.buttonLabel,
          };
        } catch (error) {
          logger.error(
            toSafeLogFields(error),
            'Failed to resolve OIDC endpoints for /config'
          );
          oidc = { enabled: false };
        }
      }

      const output: ServerConfig = {
        name: config.name,
        avatar: config.avatar ?? '',
        version: build.version,
        sha: build.sha,
        ip: request.client.ip,
        pathPrefix: config.pathPrefix,
        account: {
          google: config.account.google.enabled
            ? {
                enabled: config.account.google.enabled,
                clientId: config.account.google.clientId,
              }
            : {
                enabled: false,
              },
          oidc,
        },
        push: config.push.enabled
          ? { enabled: true, publicKey: config.push.publicKey }
          : { enabled: false },
        apns: config.apns.enabled
          ? { enabled: true, bundleId: config.apns.bundleId }
          : { enabled: false },
      };

      return output;
    },
  });

  done();
};
