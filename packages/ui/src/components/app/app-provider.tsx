import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AppInitOutput, AppType } from '@colanode/client/types';
import { build } from '@colanode/core';
import { collections } from '@colanode/ui/collections';
import { AppAssets } from '@colanode/ui/components/app/app-assets';
import { AppLayout } from '@colanode/ui/components/app/app-layout';
import { AppLoading } from '@colanode/ui/components/app/app-loading';
import { AppReset } from '@colanode/ui/components/app/app-reset';
import { AppThemeProvider } from '@colanode/ui/components/app/app-theme-provider';
import { RadarProvider } from '@colanode/ui/components/app/radar-provider';
import { Button } from '@colanode/ui/components/ui/button';
import { AppContext } from '@colanode/ui/contexts/app';

interface AppProviderProps {
  type: AppType;
}

export const AppProvider = ({ type }: AppProviderProps) => {
  const [initOutput, setInitOutput] = useState<AppInitOutput | null>(null);

  useEffect(() => {
    console.log(`Colanode | Version: ${build.version} | SHA: ${build.sha}`);

    window.colanode.init().then((output) => {
      console.log('Colanode | Initialized');

      if (output === 'success') {
        collections
          .preload()
          .then(() => {
            setInitOutput('success');
          })
          .catch((err) => {
            setInitOutput('error');
            console.error('Colanode | Error preloading', err);
          });
      } else {
        setInitOutput(output);
      }
    });
  }, []);

  return (
    <AppContext.Provider value={{ type }}>
      <AppThemeProvider init={initOutput}>
        <AppAssets />
        {initOutput === null && <AppLoading />}
        {initOutput === 'reset' && <AppReset />}
        {initOutput === 'error' && (
          <div
            data-testid="app-init-error"
            className="flex min-h-screen w-full flex-col items-center justify-center gap-4 p-6 text-center"
          >
            <TriangleAlert className="size-12 text-destructive" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Something went wrong
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Colanode could not finish loading. Please try again.
            </p>
            <Button
              data-testid="app-init-error-reload"
              className="min-h-11 min-w-11"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        )}
        {initOutput === 'success' && (
          <RadarProvider>
            <AppLayout type={type} />
          </RadarProvider>
        )}
      </AppThemeProvider>
    </AppContext.Provider>
  );
};
