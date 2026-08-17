// A workaround to make the globals.css file work in the web app
import '../../../packages/ui/src/styles/globals.css';

import { useRegisterSW } from 'virtual:pwa-register/react';

import { App } from '@colanode/ui';

// Stamped at build time by mdt.sh into apps/web/.env.production (image tag +
// commit + build time). Shown as a tiny badge so we can confirm a browser
// actually picked up a new deploy and track which build is live.
const env = import.meta.env as unknown as Record<string, string | undefined>;
const WIKI_VERSION = env.VITE_WIKI_VERSION ?? 'dev';

export const Root = () => {
  useRegisterSW({
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  return (
    <>
      <App type="web" />
      <div
        title="Wiki build version"
        style={{
          position: 'fixed',
          right: 4,
          bottom: 2,
          zIndex: 2147483647,
          pointerEvents: 'none',
          userSelect: 'none',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 9,
          lineHeight: '11px',
          opacity: 0.4,
          whiteSpace: 'nowrap',
        }}
      >
        {WIKI_VERSION}
      </div>
    </>
  );
};
