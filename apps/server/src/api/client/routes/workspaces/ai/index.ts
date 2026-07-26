import { FastifyPluginCallback } from 'fastify';

import { aiCompleteRoute } from './ai-complete';
import { aiSettingsGetRoute } from './ai-settings-get';
import { aiSettingsUpdateRoute } from './ai-settings-update';

export const aiRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(aiCompleteRoute);
  instance.register(aiSettingsGetRoute);
  instance.register(aiSettingsUpdateRoute);

  done();
};
