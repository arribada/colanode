// ABOUTME: "Fill with AI" action for a text field inside the record modal — it
// ABOUTME: calls the ai.complete mutation with the record's other fields as context.
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { FieldAttributes } from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { buildRecordAiContext } from '@colanode/ui/lib/databases';

const friendlyAiError = (message: string): string => {
  if (/no ai credentials/i.test(message)) {
    return 'AI is not configured yet. Open Settings → AI Assistant to add a key, or ask an admin to enable the team key.';
  }
  return message;
};

interface RecordFieldAiAutofillProps {
  field: FieldAttributes;
  onComplete?: () => void;
}

export const RecordFieldAiAutofill = ({
  field,
  onComplete,
}: RecordFieldAiAutofillProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const record = useRecord();
  const [isRunning, setIsRunning] = useState(false);

  const handleAutofill = async () => {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    try {
      const context = buildRecordAiContext(record, database.fields, field.id);
      const prompt = `You are filling in the "${field.name}" property of a database record. Using the record's other properties as context, provide a concise, plausible value for "${field.name}". Return only the value text, with no field labels, quotes or extra commentary.`;

      const result = await window.colanode.executeMutation({
        type: 'ai.complete',
        userId: workspace.userId,
        action: 'custom',
        prompt,
        selection: '',
        context,
      });

      if (!result.success) {
        toast.error(friendlyAiError(result.error.message));
        return;
      }

      const output = result.output as { text: string };
      const text = (output.text ?? '').trim();
      if (!text) {
        toast.error('The AI did not return any text.');
        return;
      }

      workspace.collections.nodes.update(record.id, (draft) => {
        if (draft.type !== 'record') {
          return;
        }
        draft.fields[field.id] = { type: 'text', value: text };
      });

      toast.success('Field filled with AI');
      onComplete?.();
    } catch {
      toast.error('The AI request failed. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <button
      type="button"
      data-testid={`record-field-ai-autofill-${field.id}`}
      disabled={isRunning || !record.canEdit}
      className="flex cursor-pointer flex-row items-center gap-2 p-1 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      onClick={handleAutofill}
    >
      <Sparkles className="size-4" />
      <span>{isRunning ? 'Filling…' : 'Fill with AI'}</span>
    </button>
  );
};
