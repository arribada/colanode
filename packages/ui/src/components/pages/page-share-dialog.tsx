// ABOUTME: Share dialog for a page — create a public read-only link (password /
// ABOUTME: expiry / sub-pages), copy it, and revoke existing links.
import { Copy, Link2, Trash2, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  LocalDatabaseNode,
  LocalPageNode,
  LocalRecordNode,
} from '@colanode/client/types';
import { Button } from '@colanode/ui/components/ui/button';
import { Checkbox } from '@colanode/ui/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Input } from '@colanode/ui/components/ui/input';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface ShareItem {
  id: string;
  token: string;
  includeSubpages: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  createdAt: string;
}

interface SuggestionItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  proposedHtml: string;
  proposedText: string | null;
  createdAt: string;
}

interface PageShareDialogProps {
  page: LocalPageNode | LocalRecordNode | LocalDatabaseNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'Never', days: null },
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

const shareUrl = (token: string) =>
  `${window.location.origin}/share/${token}`;

export const PageShareDialog = ({
  page,
  open,
  onOpenChange,
}: PageShareDialogProps) => {
  const workspace = useWorkspace();

  const [shares, setShares] = useState<ShareItem[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [permission, setPermission] = useState<'read' | 'suggest'>('read');
  const [includeSubpages, setIncludeSubpages] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [expiryDays, setExpiryDays] = useState<number | null>(7);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.colanode.executeMutation({
        type: 'node.share.list',
        userId: workspace.userId,
        nodeId: page.id,
      });
      if (result.success) {
        setShares((result.output as { shares: ShareItem[] }).shares);
      }
      const sug = await window.colanode.executeMutation({
        type: 'node.share.suggestions.list',
        userId: workspace.userId,
        nodeId: page.id,
      });
      if (sug.success) {
        setSuggestions(
          (sug.output as { suggestions: SuggestionItem[] }).suggestions
        );
      }
    } catch {
      // ignore — the lists just stay as-is
    } finally {
      setLoading(false);
    }
  }, [workspace.userId, page.id]);

  const resolve = async (
    suggestionId: string,
    status: 'approved' | 'rejected'
  ) => {
    try {
      await window.colanode.executeMutation({
        type: 'node.share.suggestion.resolve',
        userId: workspace.userId,
        suggestionId,
        status,
      });
      setExpanded(null);
      await refresh();
    } catch {
      toast.error('Could not update the suggestion');
    }
  };

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  const passwordTooShort =
    usePassword && password.length > 0 && password.length < 8;
  const passwordMissing = usePassword && password.length === 0;

  // Strong random password; skips ambiguous glyphs (O/0, l/1) so it stays
  // readable when shared out of band.
  const generatePassword = () => {
    const charset =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
    const values = new Uint32Array(16);
    crypto.getRandomValues(values);
    let out = '';
    for (let i = 0; i < values.length; i++) {
      out += charset[(values[i] ?? 0) % charset.length];
    }
    setPassword(out);
  };

  const create = async () => {
    if (usePassword && password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setCreating(true);
    try {
      const result = await window.colanode.executeMutation({
        type: 'node.share.create',
        userId: workspace.userId,
        nodeId: page.id,
        permission,
        includeSubpages,
        password: usePassword && password.length > 0 ? password : null,
        expiresInDays: expiryDays,
      });
      if (!result.success) {
        toast.error(result.error.message ?? 'Could not create the link');
        return;
      }
      const token = (result.output as { token: string }).token;
      await navigator.clipboard
        ?.writeText(shareUrl(token))
        .catch(() => undefined);
      toast.success('Share link created and copied');
      setPassword('');
      setUsePassword(false);
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create the link'
      );
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (shareId: string) => {
    // Optimistically drop it so the row disappears instantly; refresh reconciles
    // with the server (which filters revoked links out of the list).
    setShares((prev) => prev.filter((s) => s.id !== shareId));
    try {
      await window.colanode.executeMutation({
        type: 'node.share.revoke',
        userId: workspace.userId,
        shareId,
      });
    } catch {
      toast.error('Could not revoke the link');
    }
    await refresh();
  };

  const copy = (token: string) => {
    void navigator.clipboard?.writeText(shareUrl(token));
    toast.success('Link copied');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share this page</DialogTitle>
          <DialogDescription>
            Create a public read-only link. Anyone with the link (and the
            password, if set) can view the page without an account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Access
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPermission('read')}
                className={cn(
                  'flex-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent',
                  permission === 'read'
                    ? 'border-primary bg-accent'
                    : 'border-border'
                )}
              >
                Read-only
              </button>
              <button
                type="button"
                onClick={() => setPermission('suggest')}
                className={cn(
                  'flex-1 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent',
                  permission === 'suggest'
                    ? 'border-primary bg-accent'
                    : 'border-border'
                )}
              >
                Allow suggestions
              </button>
            </div>
            {permission === 'suggest' && (
              <p className="mt-1 text-xs text-muted-foreground">
                Visitors give their name + email and can propose edits — sent to
                you for approval, not published directly.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIncludeSubpages((v) => !v)}
            className="flex items-start gap-2 rounded-md p-1 text-left hover:bg-accent"
          >
            <Checkbox
              checked={includeSubpages}
              className="pointer-events-none mt-0.5"
            />
            <span>
              <span className="text-sm font-medium">Include sub-pages</span>
              <span className="block text-xs text-muted-foreground">
                Show this page and its sub-pages.
              </span>
            </span>
          </button>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setUsePassword((v) => !v)}
              className="flex items-start gap-2 rounded-md p-1 text-left hover:bg-accent"
            >
              <Checkbox
                checked={usePassword}
                className="pointer-events-none mt-0.5"
              />
              <span className="text-sm font-medium">Require a password</span>
            </button>
            {usePassword && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="text"
                    value={password}
                    placeholder="Password (min 8 characters)"
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generatePassword}
                    className="shrink-0"
                    title="Generate a strong password"
                  >
                    <Wand2 className="size-4" />
                    Generate
                  </Button>
                </div>
                {passwordTooShort && (
                  <p className="text-xs text-red-600">
                    Password must be at least 8 characters.
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Expires
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setExpiryDays(o.days)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-sm hover:bg-accent',
                    expiryDays === o.days
                      ? 'border-primary bg-accent'
                      : 'border-border'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            onClick={create}
            disabled={creating || passwordTooShort || passwordMissing}
          >
            {creating ? (
              <Spinner className="size-4" />
            ) : (
              <Link2 className="size-4" />
            )}
            Create link
          </Button>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Active links {loading ? '…' : `(${shares.length})`}
            </p>
            {shares.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground">No links yet.</p>
            )}
            {shares.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-md border p-2 text-sm"
              >
                <span className="flex-1 truncate font-mono text-xs">
                  {shareUrl(s.token)}
                </span>
                {s.hasPassword && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    🔒
                  </span>
                )}
                {s.expiresAt && (
                  <span className="text-xs text-muted-foreground">
                    exp. {new Date(s.expiresAt).toLocaleDateString()}
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Copy link"
                  onClick={() => copy(s.token)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Revoke link"
                  onClick={() => revoke(s.id)}
                  className="text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Pending suggestions ({suggestions.length})
              </p>
              {suggestions.map((sg) => (
                <div key={sg.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate">
                      <span className="font-medium">
                        {sg.firstName} {sg.lastName}
                      </span>{' '}
                      <span className="text-xs text-muted-foreground">
                        {sg.email}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded(expanded === sg.id ? null : sg.id)
                      }
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {expanded === sg.id ? 'Hide' : 'View'}
                    </button>
                    <button
                      type="button"
                      onClick={() => resolve(sg.id, 'approved')}
                      className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => resolve(sg.id, 'rejected')}
                      className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                    >
                      Reject
                    </button>
                  </div>
                  {expanded === sg.id && (
                    <iframe
                      title="Proposed content"
                      sandbox=""
                      srcDoc={sg.proposedHtml}
                      className="mt-2 h-64 w-full rounded border bg-white"
                    />
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Approving records the suggestion; apply the change to the page
                yourself for now.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
