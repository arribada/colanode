import { describe, expect, it } from 'vitest';

import { NodePathService } from '../src/node-path-service';

describe('NodePathService', () => {
  const svc = new NodePathService('/data/colanode');

  it('roots the app database under the data dir', () => {
    expect(svc.appDatabase).toBe('/data/colanode/app.db');
  });

  it('derives per-workspace database paths from userId', () => {
    expect(svc.workspaceDatabase('us-123')).toBe(
      '/data/colanode/workspaces/us-123/workspace.db'
    );
  });

  it('builds workspace file paths from userId, fileId, extension', () => {
    expect(svc.workspaceFile('us-1', 'fi-9', '.png')).toBe(
      '/data/colanode/workspaces/us-1/files/fi-9.png'
    );
  });
});
