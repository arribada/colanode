import { LocalWhiteboardNode } from '@colanode/client/types';
import { Tab } from '@colanode/ui/components/layouts/tabs/tab';

interface WhiteboardTabProps {
  whiteboard: LocalWhiteboardNode;
}

export const WhiteboardTab = ({ whiteboard }: WhiteboardTabProps) => {
  const name =
    whiteboard.name && whiteboard.name.length > 0 ? whiteboard.name : 'Untitled';
  return <Tab id={whiteboard.id} avatar={whiteboard.avatar} name={name} />;
};
