import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { anthropicChatModels } from '@colanode/core';
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

export const WorkspaceAiSettings = () => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();
  const [isTesting, setIsTesting] = useState(false);

  const settingsQuery = useQuery({
    type: 'ai.settings.get',
    userId: workspace.userId,
  });

  const settings = settingsQuery.data;

  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [apiKey, setApiKey] = useState('');

  // Seed the local form from the server settings once they load. The raw key is
  // never returned; hasApiKey just tells us whether one is stored.
  useEffect(() => {
    if (!settings) {
      return;
    }

    setEnabled(settings.enabled);
    setModel(settings.model ?? DEFAULT_MODEL);
  }, [settings]);

  const hasSavedKey = settings?.hasApiKey ?? false;

  const handleSave = () => {
    if (enabled && !hasSavedKey && apiKey.trim().length === 0) {
      toast.error('Enter your Anthropic API key to enable the AI assistant.');
      return;
    }

    mutate({
      input: {
        type: 'ai.settings.update',
        userId: workspace.userId,
        enabled,
        provider: 'anthropic',
        model,
        // Empty string keeps the previously stored key server-side.
        apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined,
      },
      onSuccess() {
        setApiKey('');
        settingsQuery.refetch();
        toast.success('AI settings saved');
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const handleTest = () => {
    setIsTesting(true);
    mutate({
      input: {
        type: 'ai.complete',
        userId: workspace.userId,
        action: 'custom',
        prompt:
          'Reply with exactly the two words: connection ok. Nothing else.',
        selection: '',
      },
      onSuccess(output) {
        setIsTesting(false);
        toast.success(`Claude replied: ${output.text.trim().slice(0, 80)}`);
      },
      onError(error) {
        setIsTesting(false);
        toast.error(error.message);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">AI Assistant</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use Anthropic&apos;s Claude to improve, summarize, translate and
          generate text right inside the editor. This uses{' '}
          <span className="font-medium">your own Anthropic API key</span> — it
          is sent to this workspace&apos;s server and used only for your
          requests. Get a key at{' '}
          <span className="font-mono">console.anthropic.com</span>.
        </p>
        <Separator className="mt-3" />
      </div>

      {settingsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading AI settings…
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Checkbox
              id="ai-enabled"
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <label
              htmlFor="ai-enabled"
              className="cursor-pointer text-sm font-medium"
            >
              Enable the AI assistant in the editor
            </label>
          </div>

          <div className="space-y-2">
            <Label>Provider</Label>
            <div className="flex h-9 w-full max-w-sm items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
              Anthropic — Claude
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-api-key">Anthropic API key</Label>
            <Input
              id="ai-api-key"
              type="password"
              autoComplete="off"
              className="max-w-sm"
              placeholder={
                hasSavedKey
                  ? 'A key is saved — leave blank to keep it'
                  : 'sk-ant-…'
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {hasSavedKey
                ? 'A key is already stored. Type a new one to replace it.'
                : 'Your key is stored server-side and never shown again.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
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
              <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-56">
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
              Test connection
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Test connection runs a tiny live request against Claude using your
            saved settings. Save first if you just changed your key.
          </p>
        </div>
      )}
    </div>
  );
};
