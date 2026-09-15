// ABOUTME: Installing the wiki as an app straight from the browser: catching the
// ABOUTME: one-shot install prompt, knowing when we already run installed, keeping data.

export type InstallOutcome = 'accepted' | 'dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
}

/**
 * What an "install" entry can honestly offer:
 * - installed: we are already running as the installed app;
 * - prompt: the browser handed over its install prompt and we can open it;
 * - manual: the browser installs only from its own menu (Safari), has not
 *   offered a prompt, or cannot install web apps at all (Firefox desktop).
 */
export type InstallAvailability = 'installed' | 'prompt' | 'manual';

export const getInstallAvailability = (state: {
  standalone: boolean;
  hasPrompt: boolean;
}): InstallAvailability => {
  if (state.standalone) {
    return 'installed';
  }

  return state.hasPrompt ? 'prompt' : 'manual';
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let captured = false;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

/**
 * Starts listening for the browser's install prompt. Call it at startup:
 * Chromium fires beforeinstallprompt once, early, and a listener attached when
 * the sidebar finally mounts would already have missed it.
 */
export const capturePwaInstallPrompt = (): void => {
  if (captured || typeof window === 'undefined') {
    return;
  }

  captured = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress the browser's own mini-infobar: the sidebar offers the same
    // prompt when the user actually asks for it.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
};

export const isRunningInstalled = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const standalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari never matches the media query; it exposes its own flag.
  const iosStandalone =
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standalone || iosStandalone;
};

export const readInstallAvailability = (): InstallAvailability =>
  getInstallAvailability({
    standalone: isRunningInstalled(),
    hasPrompt: deferredPrompt !== null,
  });

export const subscribePwaInstall = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Opens the browser's install prompt. A prompt event can be used exactly once,
 * so it is dropped before being shown: a second click must not reuse it.
 */
export const promptPwaInstall = async (): Promise<
  InstallOutcome | 'unavailable'
> => {
  const prompt = deferredPrompt;
  if (!prompt) {
    return 'unavailable';
  }

  deferredPrompt = null;
  notify();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome;
};

/**
 * Asks the browser not to evict the local database under storage pressure --
 * which, for a local-first wiki, would otherwise mean a full resync.
 *
 * Only from the installed app. Chromium grants it silently there, while in a
 * plain Firefox tab the same call raises a permission prompt on a first visit,
 * for something the visitor never asked for.
 */
export const requestDurableStorage = async (): Promise<boolean> => {
  if (!isRunningInstalled() || typeof navigator === 'undefined') {
    return false;
  }

  const storage = navigator.storage;
  if (
    !storage ||
    typeof storage.persist !== 'function' ||
    typeof storage.persisted !== 'function'
  ) {
    return false;
  }

  if (await storage.persisted()) {
    return true;
  }

  return storage.persist();
};
