import { KeyRound } from 'lucide-react';

import { Button } from '@colanode/ui/components/ui/button';
import { useApp } from '@colanode/ui/contexts/app';
import { useAuth } from '@colanode/ui/contexts/auth';
import { OIDC_STATE_STORAGE_KEY } from '@colanode/ui/lib/oidc';

interface OidcLoginProps {
  context: 'login' | 'register';
  disabled?: boolean;
}

// Unlike Google's `useGoogleLogin` (which runs the whole authorization-code
// exchange in a popup via `postmessage`, so the button's `onSuccess`
// handler gets a `code` without ever leaving the page), a generic OIDC
// provider is a plain redirect: we navigate the whole browser tab to the
// provider's authorize URL and it redirects back to `redirectUri` (the
// `/auth/sso-callback` route) with `?code=&state=`. That callback route
// finishes the login — this component's only job is to kick off the
// redirect with a fresh CSRF `state`, persisted so the callback route can
// verify it round-tripped unmodified and knows which server to talk to.
export const OidcLogin = ({ context, disabled }: OidcLoginProps) => {
  const app = useApp();
  const auth = useAuth();
  const config = auth.server.attributes.account?.oidc;

  if (app.type !== 'web' || !config?.enabled || !config.authorizeUrl) {
    return null;
  }

  const handleClick = () => {
    const state = crypto.randomUUID();

    sessionStorage.setItem(
      OIDC_STATE_STORAGE_KEY,
      JSON.stringify({ domain: auth.server.domain, state })
    );

    const url = new URL(config.authorizeUrl!);
    url.searchParams.set('state', state);
    window.location.href = url.toString();
  };

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={disabled}
      type="button"
      data-testid={`oidc-${context}-button`}
    >
      <KeyRound className="mr-1 size-4" />
      {config.buttonLabel || 'Continue with SSO'}
    </Button>
  );
};
