import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  ServerCreateMutationInput,
  ServerCreateMutationOutput,
} from '@colanode/client/mutations/servers/server-create';
import { AppService } from '@colanode/client/services/app-service';
import {
  appendConfigPath,
  hasConfigPath,
  normalizeServerUrl,
} from '@colanode/core';

export class ServerCreateMutationHandler
  implements MutationHandler<ServerCreateMutationInput>
{
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  async handleMutation(
    input: ServerCreateMutationInput
  ): Promise<ServerCreateMutationOutput> {
    const url = normalizeServerUrl(input.url);
    if (url === null) {
      throw new MutationError(
        MutationErrorCode.ServerUrlInvalid,
        'The provided URL is not valid. Please make sure it is a valid server URL.'
      );
    }

    let server = await this.app.createServer(url);
    if (server === null && !hasConfigPath(url)) {
      // The user probably entered a bare domain or origin: retry against the
      // conventional /config endpoint so 'colanode.example.com' just works.
      server = await this.app.createServer(appendConfigPath(url));
    }

    if (server === null) {
      throw new MutationError(
        MutationErrorCode.ServerInitFailed,
        'There was an error initializing the server. Please make sure the URL is correct and the server is running.'
      );
    }

    return {
      server: server.server,
    };
  }
}
