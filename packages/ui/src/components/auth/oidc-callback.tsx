import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { ArribadaWordmark } from '@colanode/ui/components/ui/arribada-logo';
import { Button } from '@colanode/ui/components/ui/button';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import {
  clearOidcLoginAttempt,
  readOidcLoginAttempt,
} from '@colanode/ui/lib/oidc';

interface OidcCallbackProps {
  code?: string;
  state?: string;
  error?: string;
}

// This route is intentionally NOT nested under `/auth` (`AuthLayout` only
// renders its `Outlet` once a server has been selected into local React
// state — state that a full-page redirect out to the identity provider and
// back always wipes). Everything this page needs (which server, and the
// CSRF `state` to check) was persisted to sessionStorage by `OidcLogin`
// right before the redirect out; see `lib/oidc.ts`.
export const OidcCallback = ({ code, state, error }: OidcCallbackProps) => {
  const navigate = useNavigate();
  const { mutate } = useMutation();
  const attempted = useRef(false);
  const [message, setMessage] = useState('Signing you in…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (attempted.current) {
      return;
    }
    attempted.current = true;

    if (error) {
      clearOidcLoginAttempt();
      setFailed(true);
      setMessage(`Sign-in was cancelled or failed (${error}).`);
      return;
    }

    if (!code || !state) {
      setFailed(true);
      setMessage('Missing authorization code from the identity provider.');
      return;
    }

    const attempt = readOidcLoginAttempt();
    clearOidcLoginAttempt();

    if (!attempt || attempt.state !== state) {
      setFailed(true);
      setMessage(
        'Your sign-in session expired or is invalid. Please try again.'
      );
      return;
    }

    mutate({
      input: { type: 'oidc.login', code, server: attempt.domain },
      onSuccess(output) {
        if (output.type === 'success') {
          if (output.workspaces.length > 0) {
            navigate({
              to: '/workspace/$userId',
              params: { userId: output.workspaces[0]!.user.id },
              replace: true,
            });
          } else {
            navigate({ to: '/create', replace: true });
          }
        } else if (output.type === 'verify') {
          setFailed(true);
          setMessage(
            'Your account was created but still needs email verification. ' +
              'Check your inbox, or contact your administrator for help.'
          );
        }
      },
      onError(mutationError) {
        setFailed(true);
        setMessage(mutationError.message);
      },
    });
  }, [code, state, error, mutate, navigate]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-8 px-6 text-center">
      <ArribadaWordmark className="w-56 max-w-full" />
      {failed ? (
        <>
          <p className="max-w-sm text-sm text-destructive">{message}</p>
          <Button
            onClick={() => navigate({ to: '/auth/login', replace: true })}
            type="button"
            data-testid="oidc-callback-back-to-login-button"
          >
            Back to login
          </Button>
        </>
      ) : (
        <>
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </>
      )}
    </div>
  );
};
