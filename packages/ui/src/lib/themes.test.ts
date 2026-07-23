import { describe, expect, it } from 'vitest';

import { getThemeVariables } from '@colanode/ui/lib/themes';

// The Arribada fork brands the default theme: when no explicit theme color is
// selected, the accent is Arribada teal (#1de9b6) and dark mode uses the brand
// navy surfaces. Explicit theme colors must fully replace the brand overlay so
// the selectable presets behave exactly like upstream.
describe('getThemeVariables', () => {
  it('uses the Arribada teal accent by default in light mode', () => {
    const vars = getThemeVariables('light', undefined);

    expect(vars['--primary']).toBe('oklch(0.832 0.162 169.2)');
    expect(vars['--primary-foreground']).toBe('oklch(0.209 0.038 251.5)');
    expect(vars['--sidebar-primary']).toBe('oklch(0.832 0.162 169.2)');
    // Light mode keeps the neutral white surfaces.
    expect(vars['--background']).toBe('oklch(1 0 0)');
    expect(vars['--sidebar']).toBe('oklch(0.985 0 0)');
  });

  it('uses the Arribada navy surfaces by default in dark mode', () => {
    const vars = getThemeVariables('dark', undefined);

    expect(vars['--primary']).toBe('oklch(0.832 0.162 169.2)');
    expect(vars['--primary-foreground']).toBe('oklch(0.209 0.038 251.5)');
    expect(vars['--background']).toBe('oklch(0.209 0.038 251.5)');
    expect(vars['--card']).toBe('oklch(0.3 0.063 251.4)');
    expect(vars['--sidebar']).toBe('oklch(0.3 0.063 251.4)');
  });

  it('replaces the brand overlay entirely when a theme color is selected', () => {
    const vars = getThemeVariables('dark', 'blue');

    expect(vars['--primary']).toBe('oklch(0.546 0.245 262.881)');
    // The blue preset defines its own dark background; no navy bleed-through.
    expect(vars['--background']).toBe('oklch(0.141 0.005 285.823)');
  });

  it('falls back to base variables for unknown theme colors', () => {
    const vars = getThemeVariables(
      'light',
      'not-a-color' as unknown as Parameters<typeof getThemeVariables>[1]
    );

    expect(vars['--primary']).toBe('oklch(0.205 0 0)');
  });

  it('keeps the shared base tokens', () => {
    expect(getThemeVariables('light', undefined)['--radius']).toBe('0.625rem');
    expect(getThemeVariables('dark', undefined)['--radius']).toBe('0.625rem');
  });
});
