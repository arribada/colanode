import { Check, ChevronDown } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  AiProviderName,
  anthropicChatModels,
  hasWorkspaceRole,
} from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import { Checkbox } from '@colanode/ui/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { Input } from '@colanode/ui/components/ui/input';
import { Label } from '@colanode/ui/components/ui/label';
import { Separator } from '@colanode/ui/components/ui/separator';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';

// User-facing labels for the Claude models this deployment offers. Keyed by the
// exact model id sent to the server (anthropicChatModels from @colanode/core).
const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-8': 'Claude Opus 4.8',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
};

const DEFAULT_MODEL = anthropicChatModels[0];

// The AI providers this deployment can talk to. The values are exactly what the
// server's aiProviderNameSchema accepts; 'openai' covers any OpenAI-compatible
// endpoint (e.g. Groq).
const PROVIDER_OPTIONS: { value: AiProviderName; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI-compatible / Groq' },
];

// Trigger/label for every provider the server accepts (a stored 'google' key
// still resolves a label even though it isn't offered in the picker above).
const PROVIDER_LABELS: Record<AiProviderName, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI-compatible / Groq',
  google: 'Google (Gemini)',
};

// Anthropic ships a fixed model list; every other provider takes a free-text
// model id (e.g. Groq's 'llama-3.3-70b-versatile').
const isAnthropic = (provider: AiProviderName): boolean =>
  provider === 'anthropic';

// Narrow the server's stored provider string to a known provider, defaulting to
// Anthropic for anything unexpected.
const toProviderName = (value: string | null): AiProviderName =>
  value === 'openai' || value === 'google' ? value : 'anthropic';

// Shared shape of both the personal (ai.settings.get) and team
// (ai.settings.workspace.get) query outputs, as far as this UI cares.
type AiSectionSettings = {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  hasApiKey: boolean;
};

// Friendly error for the server's flattened AiNotConfigured message.
const friendlyAiError = (message: string): string => {
  if (/no ai credentials/i.test(message)) {
    return 'The AI isn’t set up. Add a key below to enable it.';
  }
  return message;
};

interface AiSettingsSectionProps {
  variant: 'team' | 'personal';
  userId: string;
  title: string;
  description: ReactNode;
  enableLabel: string;
  settings: AiSectionSettings | undefined;
  isLoading: boolean;
  onSaved: () => void;
}

// One reusable form for either AI key scope. The two scopes differ only in the
// save mutation (ai.settings.workspace.update vs ai.settings.update) and the
// query that gets refetched afterwards (via onSaved). The "Test the connection"
// button fires a tiny ai.complete, which the server resolves against whichever
// credentials apply to the current user (own key → team key → server).
const AiSettingsSection = ({
  variant,
  userId,
  title,
  description,
  enableLabel,
  settings,
  isLoading,
  onSaved,
}: AiSettingsSectionProps) => {
  const { mutate, isPending } = useMutation();
  const [isTesting, setIsTesting] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<AiProviderName>('anthropic');
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [apiKey, setApiKey] = useState('');

  // Seed the local form from the server settings once they load. The raw key is
  // never returned; hasApiKey just tells us whether one is stored.
  useEffect(() => {
    if (!settings) {
      return;
    }
    setEnabled(settings.enabled);
    setProvider(toProviderName(settings.provider));
    setModel(settings.model ?? DEFAULT_MODEL);
  }, [settings]);

  const hasSavedKey = settings?.hasApiKey ?? false;
  const idPrefix = `ai-${variant}`;

  // Switching provider keeps the model sensible: snap to a known Claude model
  // when returning to Anthropic, and clear a Claude model id when leaving it so
  // the free-text field starts empty.
  const handleProviderChange = (next: AiProviderName) => {
    setProvider(next);
    const isKnownAnthropicModel = (
      anthropicChatModels as readonly string[]
    ).includes(model);
    if (next === 'anthropic') {
      if (!isKnownAnthropicModel) {
        setModel(DEFAULT_MODEL);
      }
    } else if (isKnownAnthropicModel) {
      setModel('');
    }
  };

  const handleSave = () => {
    if (enabled && !hasSavedKey && apiKey.trim().length === 0) {
      toast.error('Enter an API key to enable the AI assistant.');
      return;
    }

    const trimmedModel = model.trim();
    if (trimmedModel.length === 0) {
      toast.error('Enter a model name (for example llama-3.3-70b-versatile).');
      return;
    }

    const trimmedKey = apiKey.trim();
    // Empty string keeps the previously stored key server-side.
    const apiKeyToSend = trimmedKey.length > 0 ? trimmedKey : undefined;
    const onSuccess = () => {
      setApiKey('');
      onSaved();
      toast.success('AI settings saved');
    };
    const onError = (error: { message: string }) => {
      toast.error(friendlyAiError(error.message));
    };

    if (variant === 'team') {
      mutate({
        input: {
          type: 'ai.settings.workspace.update',
          userId,
          enabled,
          provider,
          model: trimmedModel,
          apiKey: apiKeyToSend,
        },
        onSuccess,
        onError,
      });
    } else {
      mutate({
        input: {
          type: 'ai.settings.update',
          userId,
          enabled,
          provider,
          model: trimmedModel,
          apiKey: apiKeyToSend,
        },
        onSuccess,
        onError,
      });
    }
  };

  const handleTest = () => {
    setIsTesting(true);
    mutate({
      input: {
        type: 'ai.complete',
        userId,
        action: 'custom',
        prompt:
          'Reply with exactly these two words: connection ok. Nothing else.',
        selection: '',
      },
      onSuccess(output) {
        setIsTesting(false);
        toast.success(`AI replied: ${output.text.trim().slice(0, 80)}`);
      },
      onError(error) {
        setIsTesting(false);
        toast.error(friendlyAiError(error.message));
      },
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading AI settings…
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-enabled`}
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <label
              htmlFor={`${idPrefix}-enabled`}
              className="cursor-pointer text-sm font-medium"
            >
              {enableLabel}
            </label>
          </div>

          <div className="space-y-2">
            <Label>Provider</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full max-w-sm justify-between font-normal"
                >
                  {PROVIDER_LABELS[provider]}
                  <ChevronDown className="size-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="flex items-center justify-between gap-2 cursor-pointer"
                    onSelect={() => handleProviderChange(option.value)}
                  >
                    {option.label}
                    {provider === option.value && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-api-key`}>API key</Label>
            <Input
              id={`${idPrefix}-api-key`}
              type="password"
              autoComplete="off"
              className="max-w-sm"
              placeholder={
                hasSavedKey
                  ? 'A key is saved — leave blank to keep it'
                  : isAnthropic(provider)
                    ? 'sk-ant-…'
                    : 'Your API key'
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {hasSavedKey
                ? 'A key is already saved. Enter a new one to replace it.'
                : 'The key is stored server-side and never shown again.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            {isAnthropic(provider) ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full max-w-sm justify-between font-normal"
                  >
                    {MODEL_LABELS[model] ?? model}
                    <ChevronDown className="size-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                >
                  {anthropicChatModels.map((m) => (
                    <DropdownMenuItem
                      key={m}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                      onSelect={() => setModel(m)}
                    >
                      {MODEL_LABELS[m] ?? m}
                      {model === m && <Check className="size-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Input
                  id={`${idPrefix}-model`}
                  type="text"
                  autoComplete="off"
                  className="max-w-sm"
                  placeholder="llama-3.3-70b-versatile"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the exact model id your provider expects (e.g.
                  llama-3.3-70b-versatile).
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending && <Spinner className="mr-2 size-4" />}
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || isPending}
            >
              {isTesting && <Spinner className="mr-2 size-4" />}
              Test the connection
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            “Test the connection” sends a small real request to the AI with the
            saved settings. Save first if you’ve just changed the key.
          </p>
        </div>
      )}
    </div>
  );
};

export const WorkspaceAiSettings = () => {
  const workspace = useWorkspace();
  // Mirrors the server admin gate (hasWorkspaceRole(role, 'admin')) and the
  // owner+admin gate used by workspace-users-container's canEditUsers.
  const isAdmin = hasWorkspaceRole(workspace.role, 'admin');

  const personalQuery = useQuery({
    type: 'ai.settings.get',
    userId: workspace.userId,
  });

  // The shared workspace settings endpoint is admin-only (403 otherwise), so we
  // only run this query for admins.
  const workspaceQuery = useQuery(
    {
      type: 'ai.settings.workspace.get',
      userId: workspace.userId,
    },
    { enabled: isAdmin }
  );

  const personal = personalQuery.data;
  const team = workspaceQuery.data;

  const personalUsable = Boolean(personal?.enabled && personal?.hasApiKey);
  const teamUsable = Boolean(team?.enabled && team?.hasApiKey);
  // We only *know* the team key state as an admin (non-admins never run the
  // query), so only show the definitive "not available" hint to admins.
  const showNoAiHint = isAdmin && !personalUsable && !teamUsable;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">AI assistant</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use AI in the editor to improve, summarise,
          translate and generate text — and let the AI agent create or edit wiki
          pages. Bring your own key from Anthropic (Claude) or an
          OpenAI-compatible provider such as Groq.
        </p>
        <Separator className="mt-3" />
      </div>

      {isAdmin && (
        <AiSettingsSection
          variant="team"
          userId={workspace.userId}
          title="Team key (shared)"
          description={
            <>
              Admins only. This key powers the editor AI for{' '}
              <span className="font-medium">the whole team</span> (one single
              bill) — members don’t need their own key.
            </>
          }
          enableLabel="Enable shared AI for the workspace"
          settings={team}
          isLoading={workspaceQuery.isLoading}
          onSaved={() => workspaceQuery.refetch()}
        />
      )}

      <AiSettingsSection
        variant="personal"
        userId={workspace.userId}
        title="My personal key (optional)"
        description="Optional — only add a key if you want to use YOUR account instead of the team key."
        enableLabel="Use my own key for the editor AI"
        settings={personal}
        isLoading={personalQuery.isLoading}
        onSaved={() => personalQuery.refetch()}
      />

      {showNoAiHint && (
        <div className="rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          The AI isn’t available yet. Add a team or personal key above to
          enable it.
        </div>
      )}
    </div>
  );
};
