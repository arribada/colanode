import { Outlet } from '@tanstack/react-router';
import { FileText, LayoutDashboard, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

import { ChannelContainer } from '@colanode/ui/components/channels/channel-container';
import { ChatContainer } from '@colanode/ui/components/chats/chat-container';
import { PageCommentsButton } from '@colanode/ui/components/comments/page-comments-button';
import { DatabaseContainer } from '@colanode/ui/components/databases/database-container';
import { FileContainer } from '@colanode/ui/components/files/file-container';
import { FolderContainer } from '@colanode/ui/components/folders/folder-container';
import { Container } from '@colanode/ui/components/layouts/containers/container';
import { MessageContainer } from '@colanode/ui/components/messages/message-container';
import { NodeBreadcrumb } from '@colanode/ui/components/nodes/node-breadcrumb';
import { NodeFavoriteButton } from '@colanode/ui/components/nodes/node-favorite-button';
import { NodePresenceViewers } from '@colanode/ui/components/nodes/node-presence-viewers';
import { NodeProvider } from '@colanode/ui/components/nodes/node-provider';
import { NodeSettings } from '@colanode/ui/components/nodes/node-settings';
import { PageVersionButton } from '@colanode/ui/components/nodes/page-version-button';
import { PageContainer } from '@colanode/ui/components/pages/page-container';
import { RecordContainer } from '@colanode/ui/components/records/record-container';
import { SpaceContainer } from '@colanode/ui/components/spaces/space-container';
import { PageSuggestionsButton } from '@colanode/ui/components/suggestions/page-suggestions-button';
import { Button } from '@colanode/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { WhiteboardContainer } from '@colanode/ui/components/whiteboards/whiteboard-container';
import { ContainerType } from '@colanode/ui/contexts/container';
import { useNode } from '@colanode/ui/contexts/node';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';
import { useNodeRadar } from '@colanode/ui/hooks/use-node-radar';

interface NodeContainerProps {
  type: ContainerType;
  nodeId: string;
  onFullscreen?: () => void;
}
interface NodeContentProps {
  type: ContainerType;
  onFullscreen?: () => void;
}

const NodeContent = ({ type, onFullscreen }: NodeContentProps) => {
  const data = useNode();
  useNodeRadar(data.node);

  // Pages and folders can open either as their normal document/list view or as
  // an editable whiteboard bound to the node's `boardScene` (AFFiNE-style
  // Document<->Board toggle). Whiteboard nodes always render the board.
  const canToggleView =
    data.node.type === 'page' || data.node.type === 'folder';
  const [viewMode, setViewMode] = useState<'document' | 'board'>('document');
  const isMobile = useIsMobile();
  const boardActive = canToggleView && viewMode === 'board';

  return (
    <Container
      type={type}
      fill={data.node.type === 'whiteboard' || boardActive}
      breadcrumb={<NodeBreadcrumb nodes={data.breadcrumb} />}
      actions={
        <div className="flex flex-row items-center gap-2">
          {canToggleView && (
            <div className="flex flex-row items-center gap-0.5 rounded-md border border-border p-0.5">
              <Button
                type="button"
                variant={viewMode === 'document' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1.5 px-2"
                onClick={() => setViewMode('document')}
              >
                <FileText className="size-4" />
                {!isMobile && 'Document'}
              </Button>
              <Button
                type="button"
                variant={viewMode === 'board' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1.5 px-2"
                onClick={() => setViewMode('board')}
              >
                <LayoutDashboard className="size-4" />
                {!isMobile && 'Board'}
              </Button>
            </div>
          )}
          {isMobile ? (
            (data.node.type === 'page' || data.node.type === 'record') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More actions"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto p-2">
                  <div className="flex items-center gap-2">
                    {data.node.type === 'page' && (
                      <PageCommentsButton pageId={data.node.id} />
                    )}
                    <PageSuggestionsButton pageId={data.node.id} />
                    <NodePresenceViewers nodeId={data.node.id} />
                    <NodeFavoriteButton nodeId={data.node.id} />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          ) : (
            <>
              {data.node.type === 'page' && (
                <PageCommentsButton pageId={data.node.id} />
              )}
              {(data.node.type === 'page' ||
                data.node.type === 'record') && (
                <PageSuggestionsButton pageId={data.node.id} />
              )}
              {(data.node.type === 'page' ||
                data.node.type === 'record') && (
                <NodePresenceViewers nodeId={data.node.id} />
              )}
              {(data.node.type === 'page' ||
                data.node.type === 'record') && (
                <NodeFavoriteButton nodeId={data.node.id} />
              )}
              {(data.node.type === 'page' ||
                data.node.type === 'record') && (
                <PageVersionButton page={data.node} />
              )}
            </>
          )}
          <NodeSettings
            node={data.node}
            nodes={data.breadcrumb}
            role={data.role}
          />
        </div>
      }
      onFullscreen={onFullscreen}
    >
      {data.node.type === 'space' && (
        <SpaceContainer space={data.node} role={data.role} />
      )}
      {data.node.type === 'channel' && (
        <ChannelContainer channel={data.node} role={data.role} />
      )}
      {data.node.type === 'page' &&
        (boardActive ? (
          <WhiteboardContainer
            node={data.node}
            role={data.role}
            sceneField="boardScene"
          />
        ) : (
          <PageContainer page={data.node} role={data.role} />
        ))}
      {data.node.type === 'database' && (
        <DatabaseContainer database={data.node} role={data.role} />
      )}
      {data.node.type === 'record' && (
        <RecordContainer record={data.node} role={data.role} />
      )}
      {data.node.type === 'chat' && (
        <ChatContainer node={data.node} role={data.role} />
      )}
      {data.node.type === 'folder' &&
        (boardActive ? (
          <WhiteboardContainer
            node={data.node}
            role={data.role}
            sceneField="boardScene"
          />
        ) : (
          <FolderContainer folder={data.node} role={data.role} />
        ))}
      {data.node.type === 'message' && (
        <MessageContainer message={data.node} role={data.role} />
      )}
      {data.node.type === 'file' && <FileContainer file={data.node} />}
      {data.node.type === 'whiteboard' && (
        <WhiteboardContainer node={data.node} role={data.role} />
      )}
    </Container>
  );
};

export const NodeContainer = ({
  type,
  nodeId,
  onFullscreen,
}: NodeContainerProps) => {
  return (
    <>
      <NodeProvider nodeId={nodeId}>
        <NodeContent type={type} onFullscreen={onFullscreen} />
      </NodeProvider>
      <Outlet />
    </>
  );
};
