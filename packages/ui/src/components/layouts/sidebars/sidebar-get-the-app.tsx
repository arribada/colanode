// ABOUTME: The rail's "get the app" menu: install the wiki from the browser, or
// ABOUTME: download the desktop build. Web only -- the desktop app never shows it.
import { Check, Download, Globe, Monitor } from 'lucide-react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';
import { usePwaInstall } from '@colanode/ui/hooks/use-pwa-install';
import { promptPwaInstall } from '@colanode/ui/lib/pwa';

// Where the desktop builds land. The workflow publishes one GitHub release per
// version to this public repository, so /latest stays correct on its own and
// nobody has to come back and edit a version number here.
export const DESKTOP_DOWNLOAD_URL =
  'https://github.com/arribada/colanode/releases/latest';

const MANUAL_INSTALL_HINT =
  'Chrome or Edge: the install icon at the right of the address bar. ' +
  'Safari: File > Add to Dock. Firefox cannot install web apps: use the ' +
  'desktop app instead.';

export const SidebarGetTheApp = () => {
  const availability = usePwaInstall();
  const installed = availability === 'installed';

  const installWebApp = async () => {
    if (availability !== 'prompt') {
      toast.info('Install it from your browser', {
        description: MANUAL_INSTALL_HINT,
        duration: 10000,
      });
      return;
    }

    const outcome = await promptPwaInstall();
    if (outcome === 'accepted') {
      toast.success('Arribada Wiki is installed');
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Get the app"
              className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-sidebar-accent"
            >
              <Download className="size-5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Get the app</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="end" className="w-72">
        <DropdownMenuLabel>Get the app</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={installed}
          onClick={() => void installWebApp()}
          className="flex cursor-pointer items-start gap-2"
        >
          {installed ? (
            <Check className="mt-0.5 size-4 text-muted-foreground" />
          ) : (
            <Globe className="mt-0.5 size-4 text-muted-foreground" />
          )}
          <div className="flex flex-col">
            <span>
              {installed ? 'Installed as an app' : 'Install in this browser'}
            </span>
            <span className="text-xs text-muted-foreground">
              Its own window, nothing to download, updates itself.
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => window.colanode.openExternalUrl(DESKTOP_DOWNLOAD_URL)}
          className="flex cursor-pointer items-start gap-2"
        >
          <Monitor className="mt-0.5 size-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span>Desktop app</span>
            <span className="text-xs text-muted-foreground">
              Windows, macOS, Linux. The strongest option offline.
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
