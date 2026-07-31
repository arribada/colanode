import { CloudDownload } from 'lucide-react';
import { useEffect, useState } from 'react';

import { NodeContainerSkeleton } from '@colanode/ui/components/nodes/node-container-skeleton';

// Shown while a node (or one of its ancestors) is not yet available in the
// local database — typically because the initial sync of a large workspace has
// not delivered it (or the collaborator grant on its space) yet. It shows the
// loading skeleton for a short grace period, then a gentle "still syncing"
// message, so the user is never stuck on a blank screen or an infinite spinner.
// The parent live query re-renders this away as soon as the data arrives.
export const NodeUnavailable = () => {
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!waited) {
    return <NodeContainerSkeleton />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <CloudDownload className="mb-4 size-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">
        Synchronisation…
      </h1>
      <p className="mt-2 max-w-md text-sm font-medium text-muted-foreground">
        Cette page est encore en cours de téléchargement sur votre appareil.
        Elle s'affichera automatiquement dès que votre espace de travail aura
        fini de se synchroniser. Si rien ne s'affiche, vérifiez votre connexion
        et rechargez la page.
      </p>
    </div>
  );
};
