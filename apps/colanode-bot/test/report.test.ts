import { describe, expect, it } from 'vitest';
import { formatReport } from '@colanode/bot/agent/report';

describe('formatReport', () => {
  it('returns the text unchanged when no actions were taken', () => {
    expect(formatReport('Sure, here you go.', [])).toBe('Sure, here you go.');
  });
  it('appends a per-action summary with ok/fail markers', () => {
    const out = formatReport('Done.', [
      { name: 'colanode_create_page', ok: true, result: 'Created page pg1' },
      { name: 'colanode_update_page', ok: false, result: 'permission denied' },
    ]);
    expect(out).toContain('Done.');
    expect(out).toContain('✓ colanode_create_page: Created page pg1');
    expect(out).toContain('✗ colanode_update_page: permission denied');
  });
});
