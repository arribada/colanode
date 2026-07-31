import { AppService } from '@colanode/client/services/app-service';
import { Workspace } from '@colanode/client/types/workspaces';
import { bootEngine } from '@colanode/client-node';
import { Config, loadConfig } from '@colanode/mcp/config';

export const resolveUserId = (
  workspaces: Workspace[],
  workspaceId?: string
): string => {
  if (workspaceId) {
    const match = workspaces.find((w) => w.workspaceId === workspaceId);
    if (!match) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return match.userId;
  }
  if (workspaces.length === 0) {
    throw new Error('No workspaces available for this account');
  }
  if (workspaces.length > 1) {
    throw new Error(
      'Multiple workspaces available — pass workspace_id (see colanode_list_workspaces)'
    );
  }
  return workspaces[0]!.userId;
};

let enginePromise: Promise<AppService> | null = null;

export const getEngine = (): Promise<AppService> => {
  if (!enginePromise) {
    const config = loadConfig();
    enginePromise = bootEngine({
      serverUrl: config.serverUrl,
      email: config.email,
      password: config.password,
      dataDir: config.dataDir,
    });
  }
  return enginePromise;
};

export const makeUserIdResolver =
  (app: AppService, config: Config) =>
  async (workspaceId?: string): Promise<string> => {
    const workspaces = await app.mediator.executeQuery({
      type: 'workspace.list',
    });
    return resolveUserId(workspaces, workspaceId ?? config.workspaceId);
  };
