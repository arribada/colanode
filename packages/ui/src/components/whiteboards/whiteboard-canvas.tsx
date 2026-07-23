import '@excalidraw/excalidraw/index.css';

import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import { debounce } from 'lodash-es';
import { ComponentProps, useEffect, useMemo, useRef, useState } from 'react';

import { LocalWhiteboardNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { useTheme } from '@colanode/ui/contexts/theme';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

const SAVE_DEBOUNCE_MS = 2000;

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
type ExcalidrawOnChange = NonNullable<ExcalidrawProps['onChange']>;
type ExcalidrawInitialData = ExcalidrawProps['initialData'];

// Shape of the persisted excalidraw scene blob stored in the node attributes.
// It is the parsed output of serializeAsJSON and is replaced wholesale on
// every save (last-writer-wins).
interface WhiteboardScene {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

interface WhiteboardCanvasProps {
  whiteboard: LocalWhiteboardNode;
  role: NodeRole;
}

export const WhiteboardCanvas = ({
  whiteboard,
  role,
}: WhiteboardCanvasProps) => {
  const workspace = useWorkspace();
  const theme = useTheme();

  const canEdit = hasNodeRole(role, 'editor');
  const lastSavedRef = useRef<string | null>(null);

  // Excalidraw only reads initialData on mount; it owns the canvas state
  // afterwards, so we snapshot the stored scene once.
  const [initialData] = useState<ExcalidrawInitialData>(() => {
    const scene = whiteboard.scene as WhiteboardScene | undefined;
    if (!scene) {
      return null;
    }

    return {
      elements: scene.elements ?? [],
      appState: scene.appState ?? {},
      files: scene.files ?? {},
    } as ExcalidrawInitialData;
  });

  const saveScene = useMemo(
    () =>
      debounce(
        (
          elements: Parameters<ExcalidrawOnChange>[0],
          appState: Parameters<ExcalidrawOnChange>[1],
          files: Parameters<ExcalidrawOnChange>[2]
        ) => {
          // 'database' serialization strips per-user state (selection,
          // scroll, zoom, theme) so only real content changes are saved.
          const serialized = serializeAsJSON(
            elements,
            appState,
            files,
            'database'
          );

          if (serialized === lastSavedRef.current) {
            return;
          }

          const nodes = workspace.collections.nodes;
          if (!nodes.has(whiteboard.id)) {
            return;
          }

          lastSavedRef.current = serialized;
          const scene = JSON.parse(serialized) as WhiteboardScene;

          nodes.update(whiteboard.id, (draft) => {
            if (draft.type !== 'whiteboard') {
              return;
            }

            draft.scene = scene;
          });
        },
        SAVE_DEBOUNCE_MS
      ),
    [workspace, whiteboard.id]
  );

  useEffect(() => {
    return () => {
      saveScene.flush();
    };
  }, [saveScene]);

  const handleChange: ExcalidrawOnChange = (elements, appState, files) => {
    if (!canEdit) {
      return;
    }

    saveScene(elements, appState, files);
  };

  return (
    <div className="h-full w-full overflow-hidden pb-2">
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        viewModeEnabled={!canEdit}
        theme={theme.mode === 'dark' ? 'dark' : 'light'}
      />
    </div>
  );
};
