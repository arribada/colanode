import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getInstallAvailability } from './pwa';

describe('getInstallAvailability', () => {
  it('says installed when already running as the app, whatever else is true', () => {
    expect(getInstallAvailability({ standalone: true, hasPrompt: true })).toBe(
      'installed'
    );
    expect(getInstallAvailability({ standalone: true, hasPrompt: false })).toBe(
      'installed'
    );
  });

  it('offers the prompt only when the browser handed one over', () => {
    expect(getInstallAvailability({ standalone: false, hasPrompt: true })).toBe(
      'prompt'
    );
  });

  it('falls back to instructions otherwise', () => {
    // Safari and Firefox desktop never fire beforeinstallprompt.
    expect(
      getInstallAvailability({ standalone: false, hasPrompt: false })
    ).toBe('manual');
  });
});

describe('the install prompt and durable storage', () => {
  const fakeWindow = (standalone = false) =>
    Object.assign(new EventTarget(), {
      matchMedia: () => ({ matches: standalone }),
    });

  const installEvent = (outcome: 'accepted' | 'dismissed') =>
    Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome }),
    });

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the event fired at startup and suppresses the browser infobar', async () => {
    const win = fakeWindow();
    vi.stubGlobal('window', win);
    const pwa = await import('./pwa');
    pwa.capturePwaInstallPrompt();

    expect(pwa.readInstallAvailability()).toBe('manual');
    const event = installEvent('accepted');
    win.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(pwa.readInstallAvailability()).toBe('prompt');
  });

  it('uses a prompt once: a second click must not reopen a spent event', async () => {
    const win = fakeWindow();
    vi.stubGlobal('window', win);
    const pwa = await import('./pwa');
    pwa.capturePwaInstallPrompt();
    const event = installEvent('accepted');
    win.dispatchEvent(event);

    await expect(pwa.promptPwaInstall()).resolves.toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await expect(pwa.promptPwaInstall()).resolves.toBe('unavailable');
    expect(pwa.readInstallAvailability()).toBe('manual');
  });

  it('forgets the prompt once the app is installed', async () => {
    const win = fakeWindow();
    vi.stubGlobal('window', win);
    const pwa = await import('./pwa');
    pwa.capturePwaInstallPrompt();
    win.dispatchEvent(installEvent('accepted'));
    win.dispatchEvent(new Event('appinstalled'));

    expect(pwa.readInstallAvailability()).toBe('manual');
  });

  it('never asks for durable storage from a plain tab', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('window', fakeWindow(false));
    vi.stubGlobal('navigator', {
      storage: { persist, persisted: async () => false },
    });
    const pwa = await import('./pwa');

    await expect(pwa.requestDurableStorage()).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks for it from the installed app, and only if not already granted', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('window', fakeWindow(true));
    vi.stubGlobal('navigator', {
      storage: { persist, persisted: async () => false },
    });
    const pwa = await import('./pwa');

    await expect(pwa.requestDurableStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
