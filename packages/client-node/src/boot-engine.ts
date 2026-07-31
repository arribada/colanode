import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppMeta } from '@colanode/client/services/app-meta';
import { AppService } from '@colanode/client/services/app-service';

import { NodeFileSystem } from './node-file-system';
import { NodeKyselyService } from './node-kysely-service';
import { NodePathService } from './node-path-service';

export type BootEngineOptions = {
  serverUrl: string;
  email: string;
  password: string;
  dataDir: string;
  // Read-only emoji/icon DBs + fonts the engine opens at boot. Defaults to the
  // asset DBs shipped with the desktop app (resolved relative to this package).
  assetsDir?: string;
};

const defaultAssetsDir = (): string => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // packages/client-node/src → repo root is three levels up.
  return path.resolve(here, '../../../apps/desktop/assets');
};

export const bootEngine = async (
  opts: BootEngineOptions
): Promise<AppService> => {
  const meta: AppMeta = { type: 'desktop', platform: process.platform };
  const app = new AppService(
    meta,
    new NodeFileSystem(),
    new NodeKyselyService(),
    new NodePathService(opts.dataDir, opts.assetsDir ?? defaultAssetsDir())
  );

  await app.init();

  // Register the server + log in if no account is present on this data dir yet.
  if (app.getAccounts().length === 0) {
    // createServer expects the server's /config URL (the desktop/web callers
    // pass `.../config`); accept a bare base URL here and append it.
    const base = opts.serverUrl.replace(/\/+$/, '');
    const configUrl = new URL(base.endsWith('/config') ? base : `${base}/config`);
    const created = await app.createServer(configUrl);
    if (!created) {
      throw new Error(`Could not reach Colanode server at ${opts.serverUrl}`);
    }
    const result = await app.mediator.executeMutation({
      type: 'email.login',
      server: new URL(opts.serverUrl).host,
      email: opts.email,
      password: opts.password,
    });
    if (!result.success) {
      throw new Error(`Login failed: ${result.error.message}`);
    }
    if (result.output.type !== 'success') {
      throw new Error(
        'Login requires email verification — not supported headlessly'
      );
    }
  }

  return app;
};
