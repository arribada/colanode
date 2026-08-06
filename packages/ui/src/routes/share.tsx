import { createRoute } from '@tanstack/react-router';

import { PublicShare } from '@colanode/ui/components/share/public-share';
import { rootRoute } from '@colanode/ui/routes/root';

const Component = () => {
  const { token } = publicShareRoute.useParams();
  return <PublicShare token={token} />;
};

// Public, no-auth route. Deliberately a top-level sibling of the workspace tree
// (like `ssoCallbackRoute`) so it renders without an authenticated workspace and
// never redirects to /auth/login. Reachable in production only once nginx sends
// `/share/` to the web SPA (see the go-live runbook); until then the live
// server-rendered `/share/<token>` HTML is untouched.
export const publicShareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/$token',
  component: Component,
});
