import { createRoute } from '@tanstack/react-router';
import { z } from 'zod/v4';

import { OidcCallback } from '@colanode/ui/components/auth/oidc-callback';
import { rootRoute } from '@colanode/ui/routes/root';

const ssoCallbackSearchSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

const Component = () => {
  const search = ssoCallbackRoute.useSearch();
  return (
    <OidcCallback code={search.code} state={search.state} error={search.error} />
  );
};

// Deliberately a sibling of `authRoute`, not a child of it — see the
// comment in `components/auth/oidc-callback.tsx` for why.
export const ssoCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/sso-callback',
  component: Component,
  validateSearch: ssoCallbackSearchSchema,
});
