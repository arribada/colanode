// Shared between the OIDC login button (which starts the redirect) and the
// `/auth/sso-callback` route (which finishes it). A full-page redirect to
// the identity provider and back loses all in-memory React state — this is
// the only thing carried across that round trip, so it lives in
// sessionStorage rather than app/auth context.
export const OIDC_STATE_STORAGE_KEY = 'colanode.oidc-login';

export interface OidcLoginAttempt {
  domain: string;
  state: string;
}

export const readOidcLoginAttempt = (): OidcLoginAttempt | null => {
  const raw = sessionStorage.getItem(OIDC_STATE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.domain === 'string' &&
      typeof parsed.state === 'string'
    ) {
      return parsed as OidcLoginAttempt;
    }
  } catch {
    // fall through to null below
  }

  return null;
};

export const clearOidcLoginAttempt = (): void => {
  sessionStorage.removeItem(OIDC_STATE_STORAGE_KEY);
};
