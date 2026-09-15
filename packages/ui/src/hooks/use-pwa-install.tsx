import { useSyncExternalStore } from 'react';

import {
  InstallAvailability,
  readInstallAvailability,
  subscribePwaInstall,
} from '@colanode/ui/lib/pwa';

/** Re-renders when the browser offers, or withdraws, its install prompt. */
export const usePwaInstall = (): InstallAvailability =>
  useSyncExternalStore(
    subscribePwaInstall,
    readInstallAvailability,
    () => 'manual'
  );
