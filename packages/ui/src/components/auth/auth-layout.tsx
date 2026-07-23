import { Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import { Server } from '@colanode/client/types';
import { AuthCancel } from '@colanode/ui/components/auth/auth-cancel';
import { AuthServer } from '@colanode/ui/components/auth/auth-server';
import { ArribadaWordmark } from '@colanode/ui/components/ui/arribada-logo';
import { AuthContext } from '@colanode/ui/contexts/auth';

export const AuthLayout = () => {
  const [server, setServer] = useState<Server | null>(null);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center">
      <AuthCancel />
      <div className="w-full flex lg:flex-row flex-col items-center justify-center lg:gap-40 gap-20">
        <div className="flex flex-col items-center justify-center bg-background px-6 py-12">
          <div className="flex flex-col items-center gap-6 animate-in fade-in duration-700">
            <ArribadaWordmark className="w-72 lg:w-96 max-w-full" />
            <p className="font-satoshi text-xl lg:text-2xl tracking-tight text-muted-foreground">
              Team wiki &amp; collaboration platform
            </p>
          </div>
        </div>

        <div className="w-96 max-w-xl flex flex-col items-center justify-center bg-background">
          {server ? (
            <AuthContext.Provider value={{ server }}>
              <Outlet />
            </AuthContext.Provider>
          ) : (
            <AuthServer onSelect={setServer} />
          )}
        </div>
      </div>
    </div>
  );
};
