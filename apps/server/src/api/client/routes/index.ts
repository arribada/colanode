import { FastifyPluginCallback } from 'fastify';

import { accountRoutes } from '@colanode/server/api/client/routes/accounts';
import { authRoutes } from '@colanode/server/api/client/routes/auth';
import { avatarRoutes } from '@colanode/server/api/client/routes/avatars';
import { socketRoutes } from '@colanode/server/api/client/routes/sockets';
import { testRoutes } from '@colanode/server/api/client/routes/test';
import { workspaceRoutes } from '@colanode/server/api/client/routes/workspaces';

export const clientRoutes: FastifyPluginCallback = (instance, _, done) => {
  instance.register(socketRoutes, { prefix: '/sockets' });
  instance.register(accountRoutes, { prefix: '/accounts' });
  instance.register(authRoutes, { prefix: '/auth' });
  instance.register(avatarRoutes, { prefix: '/avatars' });
  instance.register(workspaceRoutes, { prefix: '/workspaces' });
  // DEV-GATED test seam — see routes/test/guard.ts. Registration is
  // unconditional; the onRequest hook inside testRoutes is what makes this
  // a no-op / 404 outside test/dev.
  instance.register(testRoutes, { prefix: '/test' });

  done();
};
