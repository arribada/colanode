import path from 'node:path';

import { PathService } from '@colanode/client/services';

export class NodePathService implements PathService {
  private readonly base: string;
  private readonly assetsBase: string;

  constructor(dataDir: string, assetsDir?: string) {
    this.base = dataDir;
    // No UI here, so avatars/emojis/icons are not served. Default assets to a
    // sub-dir of the data dir. If the engine demands real asset DBs at boot,
    // point assetsDir at the desktop/ui assets (resolved in the Task 0 gate).
    this.assetsBase = assetsDir ?? path.join(dataDir, 'assets');
  }

  public get app(): string {
    return this.base;
  }
  public get appDatabase(): string {
    return path.join(this.base, 'app.db');
  }
  public get avatars(): string {
    return path.join(this.base, 'avatars');
  }
  public get temp(): string {
    return path.join(this.base, 'temp');
  }
  public tempFile(name: string): string {
    return path.join(this.base, 'temp', name);
  }
  public avatar(avatarId: string): string {
    return path.join(this.avatars, avatarId + '.jpeg');
  }
  public workspace(userId: string): string {
    return path.join(this.base, 'workspaces', userId);
  }
  public workspaceDatabase(userId: string): string {
    return path.join(this.workspace(userId), 'workspace.db');
  }
  public workspaceFiles(userId: string): string {
    return path.join(this.workspace(userId), 'files');
  }
  public workspaceFile(
    userId: string,
    fileId: string,
    extension: string
  ): string {
    return path.join(this.workspaceFiles(userId), fileId + extension);
  }
  public dirname(dir: string): string {
    return path.dirname(dir);
  }
  public filename(file: string): string {
    return path.basename(file, path.extname(file));
  }
  public extension(name: string): string {
    return path.extname(name);
  }
  public get assets(): string {
    return this.assetsBase;
  }
  public get fonts(): string {
    return path.join(this.assetsBase, 'fonts');
  }
  public get emojisDatabase(): string {
    return path.join(this.assetsBase, 'emojis.db');
  }
  public get iconsDatabase(): string {
    return path.join(this.assetsBase, 'icons.db');
  }
  public font(name: string): string {
    return path.join(this.assetsBase, 'fonts', name);
  }
}
