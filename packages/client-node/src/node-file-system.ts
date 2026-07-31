import fs from 'node:fs';
import { Writable } from 'node:stream';

import { FileReadStream, FileSystem } from '@colanode/client/services';

export class NodeFileSystem implements FileSystem {
  public async makeDirectory(target: string): Promise<void> {
    await fs.promises.mkdir(target, { recursive: true });
  }

  public async exists(target: string): Promise<boolean> {
    return fs.promises
      .access(target)
      .then(() => true)
      .catch(() => false);
  }

  public async copy(source: string, destination: string): Promise<void> {
    await fs.promises.copyFile(source, destination);
  }

  public async readStream(target: string): Promise<FileReadStream> {
    return fs.promises.readFile(target);
  }

  public async writeStream(
    target: string
  ): Promise<WritableStream<Uint8Array>> {
    const stream = fs.createWriteStream(target);
    return Writable.toWeb(stream) as WritableStream<Uint8Array>;
  }

  public listFiles(target: string): Promise<string[]> {
    return fs.promises.readdir(target);
  }

  public readFile(target: string): Promise<Uint8Array> {
    return fs.promises.readFile(target);
  }

  public writeFile(target: string, data: Uint8Array): Promise<void> {
    return fs.promises.writeFile(target, data);
  }

  public async delete(target: string): Promise<void> {
    await fs.promises.rm(target, { recursive: true, force: true });
  }

  public async url(target: string): Promise<string | null> {
    const exists = await this.exists(target);
    if (!exists) {
      return null;
    }
    const base64Path = Buffer.from(target).toString('base64');
    return `local://files/${base64Path}`;
  }
}
