import { LocalPageNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { Document } from '@colanode/ui/components/documents/document';
import { DocumentBacklinks } from '@colanode/ui/components/documents/document-backlinks';
import { NodeCoverBanner } from '@colanode/ui/components/nodes/node-cover';
import { PageChildren } from '@colanode/ui/components/pages/page-children';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface PageContainerProps {
  page: LocalPageNode;
  role: NodeRole;
}

export const PageContainer = ({ page, role }: PageContainerProps) => {
  const workspace = useWorkspace();
  const canEdit = hasNodeRole(role, 'editor');

  // Page width (Notion-style). Default (fullWidth falsy) = a centered, readable
  // column so text stays legible and wide embeds/tables scroll inside their own
  // box instead of stretching the whole page horizontally. fullWidth = the full
  // container width, for pages built around wide tables or database embeds.
  // Toggle lives in the page ⋯ menu (page-settings.tsx).
  const fullWidth = page.fullWidth ?? false;

  return (
    <div className="group/cover">
      <NodeCoverBanner
        cover={page.cover}
        canEdit={canEdit}
        onChange={(cover) => {
          const nodes = workspace.collections.nodes;
          if (!nodes.has(page.id)) {
            return;
          }

          nodes.update(page.id, (draft) => {
            if (draft.type !== 'page') {
              return;
            }

            draft.cover = cover;
          });
        }}
      />
      <div className={cn('mx-auto w-full min-w-0', !fullWidth && 'max-w-3xl')}>
        <Document
          node={page}
          canEdit={canEdit}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary field (page title/content) focused when the page is opened
          autoFocus="start"
        />
        <PageChildren nodeId={page.id} rootId={page.rootId} canEdit={canEdit} />
        <DocumentBacklinks nodeId={page.id} />
      </div>
    </div>
  );
};
