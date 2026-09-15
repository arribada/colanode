// ABOUTME: The rail's light/dark switch: one click flips the theme actually on
// ABOUTME: screen, without a trip to Settings > Appearance.
import { Moon, Sun } from 'lucide-react';

import { ThemeMode } from '@colanode/client/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';
import { useTheme } from '@colanode/ui/contexts/theme';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

/**
 * The mode a click switches to. It starts from the theme on screen rather than
 * from the stored choice: with "System" nothing is stored, and the first click
 * must still leave the dark navy for the white theme.
 */
export const nextThemeMode = (onScreen: ThemeMode): ThemeMode =>
  onScreen === 'dark' ? 'light' : 'dark';

export const SidebarThemeToggle = () => {
  const { mode } = useTheme();
  const [, setThemeMode] = useMetadata('app', 'theme.mode');

  const target = nextThemeMode(mode);
  const label = target === 'light' ? 'Light theme' : 'Dark theme';
  const Icon = target === 'light' ? Sun : Moon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid="sidebar-theme-toggle"
          onClick={() => setThemeMode(target)}
          className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-sidebar-accent"
        >
          <Icon className="size-5 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
};
