// ABOUTME: Manage the personal MCP access tokens that let an outside agent read
// ABOUTME: and write this wiki — create, copy once, list and revoke.
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { McpTokenSummary } from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { Separator } from '@colanode/ui/components/ui/separator';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';

// The endpoint an MCP client is pointed at. Built from the current web origin so
// a self-hosted deployment on any domain shows its own address, and falling back
// to the canonical one in the desktop build, whose location is not a web URL.
const mcpEndpoint = (): string => {
  const origin =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'http:' ||
      window.location.protocol === 'https:')
      ? window.location.origin
      : 'https://docs.arribada.org';
  return `${origin}/client/mcp`;
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return 'never';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString();
};

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => toast.error('Could not copy to the clipboard.'));
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {label}
    </Button>
  );
};

const TokenRow = ({
  token,
  onRevoke,
  isRevoking,
}: {
  token: McpTokenSummary;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}) => (
  <div className="flex items-center justify-between gap-4 rounded-md border border-input p-3">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">
        {token.name?.trim() || 'Unnamed token'}
      </p>
      <p className="text-xs text-muted-foreground">
        Created {formatDate(token.createdAt)} · Last used{' '}
        {formatDate(token.lastUsedAt)}
      </p>
    </div>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isRevoking}
      className="shrink-0 text-destructive hover:text-destructive"
      onClick={() => onRevoke(token.id)}
    >
      <Trash2 className="size-4" />
      Revoke
    </Button>
  </div>
);

export const WorkspaceMcpTokens = () => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();
  const [name, setName] = useState('');
  // The raw token comes back from the server exactly once. Holding it in state
  // is the only chance anybody gets to copy it.
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const tokensQuery = useQuery({
    type: 'ai.mcp.tokens.list',
    userId: workspace.userId,
  });

  const tokens = tokensQuery.data ?? [];

  const createToken = () => {
    mutate({
      input: {
        type: 'ai.mcp.token.create',
        userId: workspace.userId,
        name: name.trim() || undefined,
      },
      onSuccess(output) {
        setFreshToken(output.token);
        setName('');
        void tokensQuery.refetch();
        toast.success('Token created — copy it now, it is shown only once.');
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const revokeToken = (tokenId: string) => {
    mutate({
      input: {
        type: 'ai.mcp.token.revoke',
        userId: workspace.userId,
        tokenId,
      },
      onSuccess() {
        void tokensQuery.refetch();
        toast.success('Token revoked');
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          MCP access tokens
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Let an outside assistant read and write this wiki through the Model
          Context Protocol, without handing over your password. A token acts as
          you: it reaches exactly the pages you can reach, and nothing more.
          Revoking one takes effect immediately.
        </p>
        <Separator className="mt-3" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Endpoint</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs">
            {mcpEndpoint()}
          </code>
          <CopyButton value={mcpEndpoint()} label="Copy" />
        </div>
      </div>

      {freshToken && (
        <div className="space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30">
          <p className="text-sm font-medium">Your new token — copy it now</p>
          <p className="text-xs text-muted-foreground">
            This is the only time it is shown. Close this page without copying
            it and you will have to create another one.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-background px-3 py-2 text-xs">
              {freshToken}
            </code>
            <CopyButton value={freshToken} label="Copy" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setFreshToken(null)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">New token</p>
          <Input
            value={name}
            placeholder="What will use it, e.g. Claude Desktop"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isPending) {
                event.preventDefault();
                createToken();
              }
            }}
          />
        </div>
        <Button
          type="button"
          disabled={isPending}
          className="shrink-0"
          onClick={createToken}
        >
          {isPending ? (
            <Spinner className="size-4" />
          ) : (
            <KeyRound className="size-4" />
          )}
          Create token
        </Button>
      </div>

      <div className="space-y-2">
        {tokensQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Loading tokens…
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active tokens. Anything you create appears here until you revoke
            it.
          </p>
        ) : (
          tokens.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              onRevoke={revokeToken}
              isRevoking={isPending}
            />
          ))
        )}
      </div>
    </div>
  );
};
