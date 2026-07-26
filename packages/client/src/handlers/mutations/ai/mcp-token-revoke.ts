import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  McpTokenRevokeMutationInput,
  McpTokenRevokeMutationOutput,
} from '@colanode/client/mutations/ai/mcp-token-revoke';
import { McpTokenRevokeOutput } from '@colanode/core';

export class McpTokenRevokeMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<McpTokenRevokeMutationInput>
{
  async handleMutation(
    input: McpTokenRevokeMutationInput
  ): Promise<McpTokenRevokeMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      const output = await workspace.account.client
        .delete(
          `v1/workspaces/${workspace.workspaceId}/ai/mcp/tokens/${input.tokenId}`
        )
        .json<McpTokenRevokeOutput>();

      return output;
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
