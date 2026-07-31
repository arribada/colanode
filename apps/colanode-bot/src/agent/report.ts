import { ToolOutcome } from '@colanode/bot/agent/tool-adapter';

export const formatReport = (text: string, actions: ToolOutcome[]): string => {
  if (actions.length === 0) {
    return text;
  }
  const lines = actions.map(
    (action) => `${action.ok ? '✓' : '✗'} ${action.name}: ${action.result}`
  );
  return [text, '', '—', ...lines].join('\n');
};
