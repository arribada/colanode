import { LocalPageNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { Document } from '@colanode/ui/components/documents/document';
import { DocumentBacklinks } from '@colanode/ui/components/documents/document-backlinks';
import { NodeCoverBanner } from '@colanode/ui/components/nodes/node-cover';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface PageContainerProps {
  page: LocalPageNode;
  role: NodeRole;
}

export const PageContainer = ({ page, role }: PageContainerProps) => {
  const workspace = useWorkspace();
  const canEdit = hasNodeRole(role, 'editor');

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
      <Document
        node={page}
        canEdit={canEdit}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary field (page title/content) focused when the page is opened
        autoFocus="start"
      />
      <DocumentBacklinks nodeId={page.id} />
    </div>
  );
};
