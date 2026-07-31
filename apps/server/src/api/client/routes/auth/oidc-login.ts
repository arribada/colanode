import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import ky from 'ky';
import sharp from 'sharp';

import {
  AccountStatus,
  generateId,
  IdType,
  ApiErrorCode,
  apiErrorOutputSchema,
  loginOutputSchema,
  oidcLoginInputSchema,
} from '@colanode/core';
import { toSafeLogFields } from '@colanode/server/api/client/lib/log-error';
import { database } from '@colanode/server/data/database';
import { UpdateAccount } from '@colanode/server/data/schema';
import {
  buildLoginSuccessOutput,
  buildLoginVerifyOutput,
} from '@colanode/server/lib/accounts';
import { config } from '@colanode/server/lib/config';
import { createLogger } from '@colanode/server/lib/logger';
import {
  fetchOidcToken,
  fetchOidcUserInfo,
  resolveOidcEndpoints,
} from '@colanode/server/lib/oidc';
import { storage } from '@colanode/server/lib/storage';
import { AccountAttributes } from '@colanode/server/types/accounts';

const logger = createLogger('api:client:auth:oidc-login');

const OidcRequestTimeout = 1000 * 10;

const uploadOidcPictureAsAvatar = async (
  pictureUrl: string
): Promise<string | null> => {
  try {
    const arrayBuffer = await ky
      .get(pictureUrl, { timeout: OidcRequestTimeout })
      .arrayBuffer();

    const originalBuffer = Buffer.from(arrayBuffer);

    const jpegBuffer = await sharp(originalBuffer)
      .resize({ width: 500, height: 500, fit: 'inside' })
      .jpeg()
      .toBuffer();

    const avatarId = generateId(IdType.Avatar);
    await storage.upload(`avatars/${avatarId}.jpeg`, jpegBuffer, 'image/jpeg');

    return avatarId;
  } catch (error) {
    logger.error(
      toSafeLogFields(error),
      `Failed to download/upload OIDC profile picture as avatar (${pictureUrl})`
    );
    return null;
  }
};

export const oidcLoginRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/oidc/login',
    schema: {
      body: oidcLoginInputSchema,
      response: {
        200: loginOutputSchema,
        400: apiErrorOutputSchema,
        429: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const oidcConfig = config.account.oidc;
      if (!oidcConfig.enabled) {
        return reply.code(400).send({
          code: ApiErrorCode.OidcAuthFailed,
          message: 'OIDC login is not allowed.',
        });
      }

      let endpoints;
      try {
        endpoints = await resolveOidcEndpoints(oidcConfig);
      } catch (error) {
        logger.error(toSafeLogFields(error), 'Failed to resolve OIDC endpoints');
        return reply.code(400).send({
          code: ApiErrorCode.OidcAuthFailed,
          message: 'OIDC provider is misconfigured.',
        });
      }

      const input = request.body;

      const token = await fetchOidcToken(endpoints.tokenUrl, oidcConfig, input.code);
      if (!token?.access_token) {
        return reply.code(400).send({
          code: ApiErrorCode.OidcAuthFailed,
          message: 'OIDC access token not found.',
        });
      }

      const oidcUser = await fetchOidcUserInfo(
        endpoints.userinfoUrl,
        token.access_token
      );
      if (!oidcUser) {
        return reply.code(400).send({
          code: ApiErrorCode.OidcAuthFailed,
          message: 'Failed to authenticate with the OIDC provider.',
        });
      }

      if (!oidcUser.email) {
        return reply.code(400).send({
          code: ApiErrorCode.OidcAuthFailed,
          message: 'OIDC provider did not return an email address.',
        });
      }

      // Unlike Google, most self-hosted OIDC providers don't assert
      // `email_verified` at all. Since the admin explicitly configured
      // this provider (and presumably trusts it), we treat the identity
      // as verified unless the provider explicitly says otherwise.
      const emailVerified = oidcUser.email_verified !== false;
      const name = oidcUser.name || oidcUser.preferred_username || oidcUser.email;

      let existingAccount = await database
        .selectFrom('accounts')
        .where('email', '=', oidcUser.email)
        .selectAll()
        .executeTakeFirst();

      if (existingAccount) {
        const existingOidcSub = existingAccount.attributes?.oidcSub;
        if (existingOidcSub && existingOidcSub !== oidcUser.sub) {
          return reply.code(400).send({
            code: ApiErrorCode.OidcAuthFailed,
            message: 'OIDC account already exists.',
          });
        }

        const updateAccount: UpdateAccount = {};

        if (existingOidcSub !== oidcUser.sub) {
          const newAttributes: AccountAttributes = {
            ...existingAccount.attributes,
            oidcSub: oidcUser.sub,
          };

          updateAccount.attributes = JSON.stringify(newAttributes);
        }

        if (existingAccount.status !== AccountStatus.Active && emailVerified) {
          updateAccount.status = AccountStatus.Active;
        }

        if (!existingAccount.avatar && oidcUser.picture) {
          updateAccount.avatar = await uploadOidcPictureAsAvatar(
            oidcUser.picture
          );
        }

        if (Object.keys(updateAccount).length > 0) {
          updateAccount.updated_at = new Date();
          existingAccount = await database
            .updateTable('accounts')
            .returningAll()
            .set(updateAccount)
            .where('id', '=', existingAccount.id)
            .executeTakeFirst();
        }

        if (!existingAccount) {
          return reply.code(400).send({
            code: ApiErrorCode.OidcAuthFailed,
            message: 'OIDC account not found.',
          });
        }

        const output = await buildLoginSuccessOutput(
          existingAccount,
          request.client
        );

        return output;
      }

      let avatar: string | null = null;
      if (oidcUser.picture) {
        avatar = await uploadOidcPictureAsAvatar(oidcUser.picture);
      }

      let status = AccountStatus.Unverified;
      if (emailVerified) {
        status = AccountStatus.Active;
      } else if (config.account.verificationType === 'automatic') {
        status = AccountStatus.Active;
      }

      const newAccount = await database
        .insertInto('accounts')
        .values({
          id: generateId(IdType.Account),
          name,
          email: oidcUser.email,
          avatar,
          status,
          created_at: new Date(),
          password: null,
          attributes: JSON.stringify({ oidcSub: oidcUser.sub }),
        })
        .returningAll()
        .executeTakeFirst();

      if (!newAccount) {
        return reply.code(400).send({
          code: ApiErrorCode.AccountCreationFailed,
          message: 'Failed to create account.',
        });
      }

      if (newAccount.status === AccountStatus.Unverified) {
        if (config.account.verificationType === 'email') {
          const output = await buildLoginVerifyOutput(newAccount);
          return output;
        }

        return reply.code(400).send({
          code: ApiErrorCode.AccountPendingVerification,
          message:
            'Account is not verified yet. Contact your administrator to verify your account.',
        });
      }

      const output = await buildLoginSuccessOutput(newAccount, request.client);
      return output;
    },
  });

  done();
};
