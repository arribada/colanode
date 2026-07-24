import { AuthMutationHandlerBase } from '@colanode/client/handlers/mutations/auth/base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  OidcLoginMutationInput,
  MutationError,
  MutationErrorCode,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';
import { OidcLoginInput, LoginOutput } from '@colanode/core';

export class OidcLoginMutationHandler
  extends AuthMutationHandlerBase
  implements MutationHandler<OidcLoginMutationInput>
{
  constructor(appService: AppService) {
    super(appService);
  }

  async handleMutation(input: OidcLoginMutationInput): Promise<LoginOutput> {
    const server = this.app.getServer(input.server);

    if (!server) {
      throw new MutationError(
        MutationErrorCode.ServerNotFound,
        `Server ${input.server} was not found! Try using a different server.`
      );
    }

    try {
      const body: OidcLoginInput = {
        code: input.code,
      };

      const response = await this.app.client
        .post(`${server.httpBaseUrl}/v1/auth/oidc/login`, {
          json: body,
        })
        .json<LoginOutput>();

      if (response.type === 'verify') {
        return response;
      }

      await this.handleLoginSuccess(response, server);

      return response;
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
