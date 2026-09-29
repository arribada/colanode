import { useEffect } from 'react';

import { AppInitOutput, ThemeColor, ThemeMode } from '@colanode/client/types';
import { ThemeContext } from '@colanode/ui/contexts/theme';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';
import { useSystemTheme } from '@colanode/ui/hooks/use-system-theme';
import { getThemeVariables } from '@colanode/ui/lib/themes';

const useApplyTheme = (mode: ThemeMode, color?: ThemeColor) => {
  // Toggle the `.dark` class and the CSS variables together, in ONE effect keyed
  // on the same inputs. They used to live in two effects with different deps
  // (`[mode]` vs `[mode, color]`) and a cleanup that stripped `.dark` on every
  // re-run/unmount. That let the two drift apart -- notably a dark app (dark
  // variables applied) whose `.dark` class had been removed, so Tailwind
  // `dark:` variants (e.g. the select-option badges) fell back to their pale
  // light-mode colours while everything variable-driven stayed dark. Applying
  // both from the same signal makes that state impossible.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const htmlElement = document.documentElement;
    htmlElement.classList.toggle('dark', mode === 'dark');

    const themeVariables = getThemeVariables(mode, color);
    Object.entries(themeVariables).forEach(([key, value]) => {
      htmlElement.style.setProperty(key, value);
    });
  }, [mode, color]);
};

const AppThemeProviderInitialized = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const systemTheme = useSystemTheme();

  const [themeMode] = useMetadata<ThemeMode>('app', 'theme.mode');
  const [themeColor] = useMetadata<ThemeColor>('app', 'theme.color');

  const resolvedThemeMode = themeMode ?? systemTheme;

  useApplyTheme(resolvedThemeMode, themeColor);

  return (
    <ThemeContext.Provider
      value={{ mode: resolvedThemeMode, color: themeColor }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const AppThemeProviderUninitialized = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const systemTheme = useSystemTheme();
  useApplyTheme(systemTheme, undefined);

  return (
    <ThemeContext.Provider value={{ mode: systemTheme, color: undefined }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const AppThemeProvider = ({
  children,
  init,
}: {
  children: React.ReactNode;
  init: AppInitOutput | null;
}) => {
  if (init !== 'success') {
    return (
      <AppThemeProviderUninitialized>{children}</AppThemeProviderUninitialized>
    );
  }

  return <AppThemeProviderInitialized>{children}</AppThemeProviderInitialized>;
};
