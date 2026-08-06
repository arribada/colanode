// ABOUTME: The public, no-account share page (/share/$token) — fetches the
// ABOUTME: shared document from /share-api, handles password/404, renders it
// ABOUTME: read-only, and (when permission==='suggest') lets an identified
// ABOUTME: visitor edit and submit a suggestion.
import { Editor } from '@tiptap/core';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import { RichTextContent } from '@colanode/core';
import { ArribadaWordmark } from '@colanode/ui/components/ui/arribada-logo';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { Label } from '@colanode/ui/components/ui/label';
import { Spinner } from '@colanode/ui/components/ui/spinner';

const PublicShareEditor = lazy(() =>
  import('@colanode/ui/editor/public/public-editor').then((module) => ({
    default: module.PublicShareEditor,
  }))
);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface PublicShareData {
  name: string;
  permission: 'read' | 'suggest';
  includeSubpages: boolean;
  workspaceName: string | null;
  content: RichTextContent;
}

interface Identity {
  firstName: string;
  lastName: string;
  email: string;
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
          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the password field is the only input on this gate
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

const ShareHeader = ({
  data,
  action,
}: {
  data: PublicShareData;
  action?: React.ReactNode;
}) => (
  <header className="mb-8 flex flex-col gap-4 border-b border-border/60 pb-6">
    <div className="flex items-center justify-between gap-3">
      <ArribadaWordmark className="h-6 w-auto opacity-80" />
      <div className="flex items-center gap-3">
        {data.workspaceName && (
          <span className="hidden truncate text-xs uppercase tracking-wide text-muted-foreground sm:inline">
            {data.workspaceName}
          </span>
        )}
        {action}
      </div>
    </div>
    <h1 className="text-3xl font-semibold leading-tight text-foreground">
      {data.name}
    </h1>
  </header>
);

const ShareFooter = ({ data }: { data: PublicShareData }) => (
  <footer className="mt-12 border-t border-border/60 pt-4 text-xs text-muted-foreground">
    {data.permission === 'suggest'
      ? 'Shared for suggestions'
      : 'Shared read-only'}
    {data.workspaceName ? ` from ${data.workspaceName}` : ''} · Powered by
    Arribada
  </footer>
);

// Modal identity gate — a suggestion is only accepted with a name + a valid
// email (the owner needs to know who proposed the edit; the server re-validates
// all of this).
const IdentityGate = ({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (identity: Identity) => void;
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  const valid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    EMAIL_RE.test(email.trim());

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground">
          Suggest an edit
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us who you are, then edit the page. Your changes are sent to the
          owner as a suggestion — the live page is not changed.
        </p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="share-first-name">First name</Label>
            <Input
              id="share-first-name"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focus the first field when the suggest gate opens
              autoFocus
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="share-last-name">Last name</Label>
            <Input
              id="share-last-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="share-email">Email</Label>
            <Input
              id="share-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Start editing
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Sticky bar shown while an identified visitor is editing a suggestion.
const SuggestBar = ({
  submitting,
  error,
  onDiscard,
  onSubmit,
}: {
  submitting: boolean;
  error: string | null;
  onDiscard: () => void;
  onSubmit: () => void;
}) => (
  <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
      <div className="min-w-0 text-sm text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          <span className="hidden sm:inline">
            You are editing a suggestion. The live page is unchanged.
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onDiscard}
          disabled={submitting}
        >
          Discard
        </Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? <Spinner className="size-4" /> : 'Submit suggestion'}
        </Button>
      </div>
    </div>
  </div>
);

const ReadyView = ({
  token,
  data,
}: {
  token: string;
  data: PublicShareData;
}) => {
  const canSuggest = data.permission === 'suggest';
  const [editor, setEditor] = useState<Editor | null>(null);
  const [mode, setMode] = useState<
    'reading' | 'identifying' | 'editing' | 'done'
  >('reading');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onEditorReady = useCallback((instance: Editor) => {
    setEditor(instance);
  }, []);

  const submit = async () => {
    if (!editor || !identity || submitting) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(shareApiUrl(token, 'suggest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: identity.firstName,
          lastName: identity.lastName,
          email: identity.email,
          html: editor.getHTML(),
          text: editor.getText(),
        }),
      });
      const body = (await response
        .json()
        .catch(() => null)) as { success?: boolean } | null;
      if (!response.ok || !body?.success) {
        setSubmitError('Could not submit your suggestion. Please try again.');
        return;
      }
      setMode('done');
    } catch {
      setSubmitError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'done') {
    return (
      <CenteredNotice
        title="Thank you — your suggestion was sent"
        description={`The owner${
          data.workspaceName ? ` of ${data.workspaceName}` : ''
        } will review your proposed changes. You can close this page.`}
      />
    );
  }

  const editing = mode === 'editing';

  return (
    <PublicShell>
      <ShareHeader
        data={data}
        action={
          canSuggest && mode === 'reading' ? (
            <Button size="sm" onClick={() => setMode('identifying')}>
              Suggest an edit
            </Button>
          ) : undefined
        }
      />
      <main className={editing ? 'flex-1 pb-24' : 'flex-1'}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <Spinner className="size-6" />
            </div>
          }
        >
          <PublicShareEditor
            token={token}
            content={data.content}
            editable={editing}
            onEditorReady={onEditorReady}
          />
        </Suspense>
      </main>
      {mode === 'reading' && <ShareFooter data={data} />}

      {canSuggest && mode === 'identifying' && (
        <IdentityGate
          onCancel={() => setMode('reading')}
          onSubmit={(id) => {
            setIdentity(id);
            setMode('editing');
          }}
        />
      )}
      {editing && (
        <SuggestBar
          submitting={submitting}
          error={submitError}
          onDiscard={() => {
            setMode('reading');
            setIdentity(null);
            setSubmitError(null);
          }}
          onSubmit={() => void submit()}
        />
      )}
    </PublicShell>
  );
};

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

  return <ReadyView token={token} data={phase.data} />;
};
