import { useNavigate } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@colanode/ui/components/ui/button';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useApp } from '@colanode/ui/contexts/app';
import { useAuth } from '@colanode/ui/contexts/auth';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
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
//
// The desktop app has no tab to send away, and sending the only window to the
// provider would leave the app behind. There, the same redirect runs in a
// window of its own (see the `oidc-login` handler in the main process): the
// return is caught before the callback page can load, and the exchange is
// done here, with the same mutation the callback route uses.
export const OidcLogin = ({ context, disabled }: OidcLoginProps) => {
  const app = useApp();
  const auth = useAuth();
  const navigate = useNavigate();
  const { mutate, isPending } = useMutation();
  const config = auth.server.attributes.account?.oidc;

  if (!config?.enabled || !config.authorizeUrl) {
    return null;
  }

  const authorizeUrl = (state: string): URL => {
    const url = new URL(config.authorizeUrl!);
    url.searchParams.set('state', state);
    return url;
  };

  const handleDesktopClick = async () => {
    const state = crypto.randomUUID();
    const url = authorizeUrl(state);
    const redirectUri = url.searchParams.get('redirect_uri');
    if (!redirectUri) {
      toast.error('This server has no sign-in address configured.');
      return;
    }

    const result = await window.colanode.openOidcLogin({
      url: url.toString(),
      redirectUri,
    });

    if (result.error === 'cancelled') {
      return;
    }

    if (!result.code || result.state !== state) {
      toast.error(
        result.error
          ? `Sign-in failed (${result.error}).`
          : 'Sign-in did not complete. Please try again.'
      );
      return;
    }

    mutate({
      input: {
        type: 'oidc.login',
        code: result.code,
        server: auth.server.domain,
      },
      onSuccess(output) {
        if (output.type !== 'success') {
          toast.error('Sign-in did not complete. Please try again.');
          return;
        }

        if (output.workspaces.length > 0) {
          navigate({
            to: '/workspace/$userId',
            params: { userId: output.workspaces[0]!.user.id },
            replace: true,
          });
        } else {
          navigate({ to: '/create', replace: true });
        }
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const handleWebClick = () => {
    const state = crypto.randomUUID();

    sessionStorage.setItem(
      OIDC_STATE_STORAGE_KEY,
      JSON.stringify({ domain: auth.server.domain, state })
    );

    window.location.href = authorizeUrl(state).toString();
  };

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={app.type === 'web' ? handleWebClick : handleDesktopClick}
      disabled={disabled || isPending}
      type="button"
      data-testid={`oidc-${context}-button`}
    >
      {isPending ? (
        <Spinner className="mr-1 size-4" />
      ) : (
        <KeyRound className="mr-1 size-4" />
      )}
      {config.buttonLabel || 'Continue with SSO'}
    </Button>
  );
};
