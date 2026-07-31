import { tools, ToolContext } from '@colanode/agent-tools';
import { runAgentLoop } from '@colanode/bot/agent/loop';
import { formatReport } from '@colanode/bot/agent/report';
import { BotConfig, loadConfig } from '@colanode/bot/config';
import { buildDialog, DialogEntry } from '@colanode/bot/dialog';
import { findBotMention } from '@colanode/bot/mention';
import {
  LlmProvider,
  OpenAiCompatibleProvider,
} from '@colanode/bot/provider/llm-provider';
import { eventBus } from '@colanode/client/lib/event-bus';
import { AppService } from '@colanode/client/services/app-service';
import { LocalNode } from '@colanode/client/types/nodes';
import { bootEngine } from '@colanode/client-node';
import { extractBlockTexts } from '@colanode/core';

const HISTORY_LIMIT = 20;

const textOf = (node: LocalNode): string => {
  if (node.type !== 'message') {
    return '';
  }
  return extractBlockTexts(node.id, node.content) ?? '';
};

const handleMessage = async (
  app: AppService,
  provider: LlmProvider,
  config: BotConfig,
  node: LocalNode,
  workspaceUserId: string,
  botUserIds: Set<string>,
  handled: Set<string>
): Promise<void> => {
  if (node.type !== 'message') return;
  if (botUserIds.has(node.createdBy)) return; // anti-loop: skip the bot's own
  if (handled.has(node.id)) return; // dedup
  if (!findBotMention(node.id, node.content, botUserIds)) {
    return;
  }
  handled.add(node.id);

  try {
    const parentId = node.parentId;
    if (!parentId) return;
    const siblings = await app.mediator.executeQuery({
      type: 'node.list',
      userId: workspaceUserId,
      filters: [{ field: ['parentId'], operator: 'eq', value: parentId }],
      sorts: [],
      limit: HISTORY_LIMIT,
    });
    const entries: DialogEntry[] = siblings
      .filter((sibling) => sibling.type === 'message')
      .map((sibling) => ({
        createdBy: sibling.createdBy,
        createdAt: sibling.createdAt,
        text: textOf(sibling),
      }));

    const dialog = buildDialog(entries, workspaceUserId);
    const ctx: ToolContext = {
      app,
      resolveUserId: async () => workspaceUserId,
    };
    const result = await runAgentLoop({
      provider,
      tools,
      systemPrompt: config.systemPrompt,
      dialog,
      ctx,
    });
    const reply = formatReport(result.text, result.actions);
    await app.mediator.executeMutation({
      type: 'message.create',
      userId: workspaceUserId,
      parentId: node.id, // reply in a thread under the mentioned message
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: reply }] },
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`bot: failed to reply to ${node.id}:`, message);
    try {
      await app.mediator.executeMutation({
        type: 'message.create',
        userId: workspaceUserId,
        parentId: node.id,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: "Couldn't reach the model right now." },
              ],
            },
          ],
        },
      });
    } catch {
      // fallback reply also failed — already logged above; stay alive.
    }
  }
};

export const startBot = async (): Promise<void> => {
  const config = loadConfig();
  const app = await bootEngine({
    serverUrl: config.serverUrl,
    email: config.botEmail,
    password: config.botPassword,
    dataDir: config.dataDir,
  });
  const workspaces = await app.mediator.executeQuery({
    type: 'workspace.list',
  });
  const botUserIds = new Set(workspaces.map((workspace) => workspace.userId));
  const provider = new OpenAiCompatibleProvider({
    baseUrl: config.llmBaseUrl,
    apiKey: config.llmApiKey,
    model: config.llmModel,
  });
  const handled = new Set<string>();

  eventBus.subscribe((event) => {
    if (event.type !== 'node.created') return;
    if (event.node.type !== 'message') return;
    void handleMessage(
      app,
      provider,
      config,
      event.node,
      event.workspace.userId,
      botUserIds,
      handled
    );
  });

  console.log(
    `colanode-bot listening as ${config.botEmail} across`,
    workspaces.length,
    'workspace(s)'
  );
};
