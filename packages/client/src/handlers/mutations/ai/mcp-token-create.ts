import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import {
  McpTokenCreateMutationInput,
  McpTokenCreateMutationOutput,
} from '@colanode/client/mutations/ai/mcp-token-create';
import { McpTokenCreateInput, McpTokenCreateOutput } from '@colanode/core';

export class McpTokenCreateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<McpTokenCreateMutationInput>
{
  async handleMutation(
    input: McpTokenCreateMutationInput
  ): Promise<McpTokenCreateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);

    try {
      const body: McpTokenCreateInput = { name: input.name };

      const output = await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/ai/mcp/tokens`, {
          json: body,
        })
        .json<McpTokenCreateOutput>();

      return output;
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
