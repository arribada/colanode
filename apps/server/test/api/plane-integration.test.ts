import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiErrorCode, WorkspaceStatus } from '@colanode/core';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  createAccount,
  createDevice,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const app = buildTestApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const VALID_PLANE_ISSUE_URL =
  'https://plane.arribada.org/arribada/projects/b61cf34b-593a-4fe4-836e-743e03fb2b59/issues/8758bff6-b0cf-45f0-af1f-7502d2e6c57f';

// These specs exercise the route as a whole against the shared Postgres
// testcontainer (see test/global-setup.ts) — same shape as
// test/api/workspace.test.ts. Pure URL-parsing edge cases live in
// packages/core/src/lib/plane.test.ts instead of being re-derived here.
describe('GET /client/v1/workspaces/:workspaceId/integrations/plane/issue', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/some-workspace-id/integrations/plane/issue?url=${encodeURIComponent(VALID_PLANE_ISSUE_URL)}`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: ApiErrorCode.TokenMissing });
  });

  it('rejects users with role none (proxy access-check happens before the Plane call)', async () => {
    const account = await createAccount({ email: 'plane-none@example.com' });
    const workspace = await createWorkspace({
      createdBy: account.id,
      status: WorkspaceStatus.Active,
    });
    await createUser({ workspaceId: workspace.id, account, role: 'none' });
    const { token } = await createDevice({ accountId: account.id });

    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/integrations/plane/issue?url=${encodeURIComponent(VALID_PLANE_ISSUE_URL)}`,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.WorkspaceNoAccess,
    });
  });

  it('rejects a user from a different workspace than the one in the URL', async () => {
    const account = await createAccount({ email: 'plane-other-ws@example.com' });
    const workspaceTheyBelongTo = await createWorkspace({
      createdBy: account.id,
      status: WorkspaceStatus.Active,
    });
    await createUser({
      workspaceId: workspaceTheyBelongTo.id,
      account,
      role: 'owner',
    });
    const { token } = await createDevice({ accountId: account.id });

    const otherWorkspace = await createWorkspace({
      createdBy: account.id,
      status: WorkspaceStatus.Active,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${otherWorkspace.id}/integrations/plane/issue?url=${encodeURIComponent(VALID_PLANE_ISSUE_URL)}`,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.WorkspaceNoAccess,
    });
  });

  it('returns 400 PlaneIntegrationDisabled when the integration is not configured (config gating, off by default)', async () => {
    const account = await createAccount({ email: 'plane-disabled@example.com' });
    const workspace = await createWorkspace({
      createdBy: account.id,
      status: WorkspaceStatus.Active,
    });
    await createUser({ workspaceId: workspace.id, account, role: 'owner' });
    const { token } = await createDevice({ accountId: account.id });

    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/integrations/plane/issue?url=${encodeURIComponent(VALID_PLANE_ISSUE_URL)}`,
      headers: buildAuthHeader(token),
    });

    // The test server boots with no PLANE_* config supplied, so the
    // discriminated `planeConfigSchema` prefaults to `{ enabled: false }` —
    // this is what "feature-flag off by default" means operationally.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ApiErrorCode.PlaneIntegrationDisabled,
    });
  });

  it('returns 400 for a request missing the required "url" querystring param', async () => {
    const account = await createAccount({ email: 'plane-no-url@example.com' });
    const workspace = await createWorkspace({
      createdBy: account.id,
      status: WorkspaceStatus.Active,
    });
    await createUser({ workspaceId: workspace.id, account, role: 'owner' });
    const { token } = await createDevice({ accountId: account.id });

    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/integrations/plane/issue`,
      headers: buildAuthHeader(token),
    });

    expect(response.statusCode).toBe(400);
  });
});
