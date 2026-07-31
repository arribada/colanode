import fs from 'node:fs';
import path from 'node:path';

import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

import { KyselyBuildOptions, KyselyService } from '@colanode/client/services';

export class NodeKyselyService implements KyselyService {
  build<T>(options: KyselyBuildOptions): Kysely<T> {
    const dir = path.dirname(options.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const database = new SQLite(options.path, { readonly: options.readonly });
    if (!options.readonly) {
      database.pragma('journal_mode = WAL');
    }

    return new Kysely<T>({ dialect: new SqliteDialect({ database }) });
  }

  async delete(target: string): Promise<void> {
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }
}
