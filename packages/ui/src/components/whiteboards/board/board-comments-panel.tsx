import { X } from 'lucide-react';
import { useRef } from 'react';

import { NodeRole } from '@colanode/core';
import { Conversation } from '@colanode/ui/components/messages/conversation';
import {
  ScrollArea,
  ScrollViewport,
} from '@colanode/ui/components/ui/scroll-area';
import { ContainerContext } from '@colanode/ui/contexts/container';

interface BoardCommentsPanelProps {
  whiteboardId: string;
  rootId: string;
  role: NodeRole;
  elementId: string;
  onClose: () => void;
}

// Comments anchored to a single whiteboard element (Miro / Notion style).
// Reuses the EXISTING message/comment infrastructure with no new node type
// and no new sync path: a board comment is a `message` node parented to the
// whiteboard, with its optional `anchorId` set to the board element id — the
// very same field inline document-comment threads use. The chat Conversation
// renders the thread list + composer + reactions + replies; scoping it with
// `anchorId={elementId}` keeps each element's thread isolated.
export const BoardCommentsPanel = ({
  whiteboardId,
  rootId,
  role,
  elementId,
  onClose,
}: BoardCommentsPanelProps) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null!);
  const scrollViewportRef = useRef<HTMLDivElement>(null!);

  return (
    <div className="pointer-events-auto absolute right-0 top-0 z-30 flex h-full w-80 max-w-full flex-col border-l border-border bg-background shadow-xl">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium">Commentaires</span>
        <button
          type="button"
          aria-label="Fermer les commentaires"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="shrink-0 px-4 pt-3 text-sm text-muted-foreground">
        Commentaire sur l’élément sélectionné.
      </p>
      <div className="min-h-0 flex-1">
        <ContainerContext.Provider
          value={{ type: 'modal', scrollAreaRef, scrollViewportRef }}
        >
          <ScrollArea ref={scrollAreaRef} className="h-full overflow-hidden">
            <ScrollViewport ref={scrollViewportRef} className="h-full">
              <div className="h-full px-4">
                <Conversation
                  conversationId={whiteboardId}
                  rootId={rootId}
                  role={role}
                  anchorId={elementId}
                />
              </div>
            </ScrollViewport>
          </ScrollArea>
        </ContainerContext.Provider>
      </div>
    </div>
  );
};
