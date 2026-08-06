// ABOUTME: The public, no-account share page (/share/$token) — fetches the
// ABOUTME: shared document from /share-api, handles password/404, and renders it
// ABOUTME: read-only with the pure editor subset.
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import { RichTextContent } from '@colanode/core';
import { ArribadaWordmark } from '@colanode/ui/components/ui/arribada-logo';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { Spinner } from '@colanode/ui/components/ui/spinner';

const PublicShareEditor = lazy(() =>
  import('@colanode/ui/editor/public/public-editor').then((module) => ({
    default: module.PublicShareEditor,
  }))
);

export interface PublicShareData {
  name: string;
  permission: 'read' | 'suggest';
  includeSubpages: boolean;
  workspaceName: string | null;
  content: RichTextContent;
}

type Phase =
  | { status: 'loading' }
  | { status: 'notfound' }
  | { status: 'error' }
  | { status: 'locked' }
  | { status: 'ready'; data: PublicShareData };

const shareApiUrl = (token: string, path: string) =>
  `/share-api/${encodeURIComponent(token)}/${path}`;

const PublicShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[100dvh] w-full overflow-y-auto bg-background text-foreground">
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col px-5 py-8 sm:px-8">
      {children}
    </div>
  </div>
);

const CenteredNotice = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) => (
  <PublicShell>
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <ArribadaWordmark className="w-48 max-w-full opacity-90" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  </PublicShell>
);

const PasswordGate = ({
  token,
  onUnlocked,
}: {
  token: string;
  onUnlocked: (data: PublicShareData) => void;
}) => {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || password.length === 0) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(shareApiUrl(token, 'unlock'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.status === 401) {
        setError('That password is not correct.');
        return;
      }
      if (!response.ok) {
        setError('This link is no longer available.');
        return;
      }
      const data = (await response.json()) as PublicShareData;
      onUnlocked(data);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CenteredNotice
      title="This page is password protected"
      description="Enter the password you were given to view this shared page."
    >
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <Input
          type="password"
          autoFocus
          value={password}
          placeholder="Password"
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || password.length === 0}>
          {submitting ? <Spinner className="size-4" /> : 'Unlock'}
        </Button>
      </form>
    </CenteredNotice>
  );
};

const ShareHeader = ({ data }: { data: PublicShareData }) => (
  <header className="mb-8 flex flex-col gap-4 border-b border-border/60 pb-6">
    <div className="flex items-center justify-between gap-3">
      <ArribadaWordmark className="h-6 w-auto opacity-80" />
      {data.workspaceName && (
        <span className="truncate text-xs uppercase tracking-wide text-muted-foreground">
          {data.workspaceName}
        </span>
      )}
    </div>
    <h1 className="text-3xl font-semibold leading-tight text-foreground">
      {data.name}
    </h1>
  </header>
);

const ShareFooter = ({ data }: { data: PublicShareData }) => (
  <footer className="mt-12 border-t border-border/60 pt-4 text-xs text-muted-foreground">
    Shared read-only
    {data.workspaceName ? ` from ${data.workspaceName}` : ''} · Powered by
    Arribada
  </footer>
);

const ReadyView = ({ data }: { data: PublicShareData }) => (
  <PublicShell>
    <ShareHeader data={data} />
    <main className="flex-1">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Spinner className="size-6" />
          </div>
        }
      >
        <PublicShareEditor content={data.content} editable={false} />
      </Suspense>
    </main>
    <ShareFooter data={data} />
  </PublicShell>
);

export const PublicShare = ({ token }: { token: string }) => {
  const [phase, setPhase] = useState<Phase>({ status: 'loading' });

  const load = useCallback(async () => {
    setPhase({ status: 'loading' });
    try {
      const response = await fetch(shareApiUrl(token, 'data'));
      if (response.status === 404) {
        setPhase({ status: 'notfound' });
        return;
      }
      if (!response.ok) {
        setPhase({ status: 'error' });
        return;
      }
      const body = (await response.json()) as
        | { locked: true }
        | PublicShareData;
      if ('locked' in body && body.locked) {
        setPhase({ status: 'locked' });
        return;
      }
      setPhase({ status: 'ready', data: body as PublicShareData });
    } catch {
      setPhase({ status: 'error' });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (phase.status === 'ready') {
      document.title = `${phase.data.name} · Arribada`;
    }
  }, [phase]);

  if (phase.status === 'loading') {
    return (
      <PublicShell>
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6" />
        </div>
      </PublicShell>
    );
  }

  if (phase.status === 'notfound') {
    return (
      <CenteredNotice
        title="This link is no longer available"
        description="The page may have been unshared, or the link has expired. Ask whoever shared it with you for a fresh link."
      />
    );
  }

  if (phase.status === 'error') {
    return (
      <CenteredNotice
        title="Something went wrong"
        description="We couldn't load this shared page. Please try again."
      >
        <Button onClick={() => void load()}>Retry</Button>
      </CenteredNotice>
    );
  }

  if (phase.status === 'locked') {
    return (
      <PasswordGate
        token={token}
        onUnlocked={(data) => setPhase({ status: 'ready', data })}
      />
    );
  }

  return <ReadyView data={phase.data} />;
};
