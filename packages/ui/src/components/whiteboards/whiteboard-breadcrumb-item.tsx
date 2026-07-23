import { LocalWhiteboardNode } from '@colanode/client/types';
import { BreadcrumbItem } from '@colanode/ui/components/layouts/containers/breadcrumb-item';

interface WhiteboardBreadcrumbItemProps {
  whiteboard: LocalWhiteboardNode;
}

export const WhiteboardBreadcrumbItem = ({
  whiteboard,
}: WhiteboardBreadcrumbItemProps) => {
  return (
    <BreadcrumbItem
      id={whiteboard.id}
      avatar={whiteboard.avatar}
      name={whiteboard.name}
    />
  );
};
