import { createChannelTool } from '@colanode/agent-tools/create-channel';
import { createPageTool } from '@colanode/agent-tools/create-page';
import { createRecordTool } from '@colanode/agent-tools/create-record';
import { getDocumentTool } from '@colanode/agent-tools/get-document';
import { listNodesTool } from '@colanode/agent-tools/list-nodes';
import { listWorkspacesTool } from '@colanode/agent-tools/list-workspaces';
import { postMessageTool } from '@colanode/agent-tools/post-message';
import {
  addReactionTool,
  removeReactionTool,
} from '@colanode/agent-tools/reactions';
import { searchRecordsTool } from '@colanode/agent-tools/search-records';
import { updatePageTool } from '@colanode/agent-tools/update-page';
import {
  MutationInput,
  SuccessMutationResult,
} from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services/app-service';

export type ToolContext = {
  app: AppService;
  resolveUserId: (workspaceId?: string) => Promise<string>;
};

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
};

export const runMutation = async <T extends MutationInput>(
  ctx: ToolContext,
  input: T
): Promise<SuccessMutationResult<T>> => {
  const result = await ctx.app.mediator.executeMutation(input);
  if (!result.success) {
    throw new Error(`${input.type} failed: ${result.error.message}`);
  }
  return result;
};

export const tools: Tool[] = [
  listWorkspacesTool,
  listNodesTool,
  getDocumentTool,
  searchRecordsTool,
  createPageTool,
  updatePageTool,
  createChannelTool,
  createRecordTool,
  postMessageTool,
  addReactionTool,
  removeReactionTool,
];
