import { LocalPageNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { Document } from '@colanode/ui/components/documents/document';
import { DocumentBacklinks } from '@colanode/ui/components/documents/document-backlinks';

interface PageContainerProps {
  page: LocalPageNode;
  role: NodeRole;
}

export const PageContainer = ({ page, role }: PageContainerProps) => {
  const canEdit = hasNodeRole(role, 'editor');
  return (
    <>
      <Document
        node={page}
        canEdit={canEdit}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary field (page title/content) focused when the page is opened
        autoFocus="start"
      />
      <DocumentBacklinks nodeId={page.id} />
    </>
  );
};
