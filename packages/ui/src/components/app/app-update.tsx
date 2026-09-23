// ABOUTME: Notices when the server is serving a newer build than the one this
// ABOUTME: tab is running, and gets the tab onto it -- by itself when nobody is
// ABOUTME: looking, with one tap otherwise.
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppType } from '@colanode/client/types';

// How often a tab that stays open asks whether it is still the current build.
// A phone keeps a tab alive for days, and the browser only re-checks the
// service worker on its own schedule, which is why people were left running
// an old build with no way to know.
const CHECK_EVERY_MS = 10 * 60 * 1000;

// Remembers the build we reloaded for, so a server that keeps answering with
// something else (a half-finished deploy, a stale proxy) cannot put the tab
// in a reload loop: the second time, the offer is shown instead.
const RELOAD_KEY = 'colanode.reloaded-for-build';

// The module the page is running, e.g. /assets/index-BOKPEQlF.js. The name
// carries a hash of the content, so a different one IS a different build.
const runningBuild = (): string | null => {
  const script = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src*="/assets/index-"]'
  );
  if (!script) {
    return null;
  }

  const match = /\/assets\/index-[A-Za-z0-9._-]+\.js/.exec(script.src);
  return match ? match[0] : null;
};

// What the server would serve to a browser opening the app right now. The
// query string keeps it away from every cache, including the service worker's.
const servedBuild = async (): Promise<string | null> => {
  const response = await fetch(`/?__v=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const match = /\/assets\/index-[A-Za-z0-9._-]+\.js/.exec(html);
  return match ? match[0] : null;
};

const readReloadedFor = (): string | null => {
  try {
    return sessionStorage.getItem(RELOAD_KEY);
  } catch {
    return null;
  }
};

const rememberReloadedFor = (build: string) => {
  try {
    sessionStorage.setItem(RELOAD_KEY, build);
  } catch {
    // A browser that refuses session storage simply loses the loop guard.
  }
};

export const useAppUpdate = (type: AppType) => {
  const [available, setAvailable] = useState<string | null>(null);
  const checking = useRef(false);

  const reload = useCallback((build: string | null) => {
    if (build) {
      rememberReloadedFor(build);
    }
    window.location.reload();
  }, []);

  const check = useCallback(async () => {
    if (checking.current || !navigator.onLine) {
      return;
    }
    checking.current = true;

    try {
      // Ask the browser to look for a new service worker at the same time:
      // it is what actually carries the new files, and it only checks by
      // itself on navigation or once a day.
      void navigator.serviceWorker?.getRegistration().then((registration) => {
        void registration?.update().catch(() => undefined);
      });

      const running = runningBuild();
      const served = await servedBuild();
      if (!running || !served || running === served) {
        return;
      }

      // Already reloaded once for this very build and still not on it: stop
      // trying and let the person decide.
      if (readReloadedFor() === served) {
        setAvailable(served);
        return;
      }

      if (document.visibilityState === 'hidden') {
        // Nobody is reading: take it now, so coming back lands on the new one.
        reload(served);
        return;
      }

      setAvailable(served);
    } catch {
      // Offline, or the server is having a moment: try again on the next tick.
    } finally {
      checking.current = false;
    }
  }, [reload]);

  useEffect(() => {
    // The desktop app updates itself through its own release feed.
    if (type !== 'web') {
      return;
    }

    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void check();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [type, check]);

  return {
    available: available !== null,
    reload: () => reload(available),
  };
};

// A quiet pill at the bottom of the screen. It is the only thing telling
// someone on a phone that they are looking at an old build -- there is no
// menu there to clear a cache.
export const AppUpdateBanner = ({ type }: { type: AppType }) => {
  const { available, reload } = useAppUpdate(type);

  if (!available) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <button
        type="button"
        onClick={reload}
        className="flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur hover:bg-accent"
      >
        <RefreshCw className="size-3.5" />A new version is ready. Reload
      </button>
    </div>
  );
};
