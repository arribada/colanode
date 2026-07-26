import { FastifyPluginCallback } from 'fastify';

import { aiAgentRoute } from './ai-agent';
import { aiCompleteRoute } from './ai-complete';
import { aiSettingsGetRoute } from './ai-settings-get';
import { aiSettingsUpdateRoute } from './ai-settings-update';
import { aiSettingsWorkspaceGetRoute } from './ai-settings-workspace-get';
import { aiSettingsWorkspaceUpdateRoute } from './ai-settings-workspace-update';

export const aiRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(aiCompleteRoute);
  instance.register(aiAgentRoute);
  instance.register(aiSettingsGetRoute);
  instance.register(aiSettingsUpdateRoute);
  instance.register(aiSettingsWorkspaceGetRoute);
  instance.register(aiSettingsWorkspaceUpdateRoute);

  done();
};
