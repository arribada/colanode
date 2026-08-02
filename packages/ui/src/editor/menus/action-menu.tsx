import { useFloating, shift, offset, FloatingPortal } from '@floating-ui/react';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { Editor } from '@tiptap/react';
import {
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import { isDescendantNode } from '@colanode/client/lib';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';

interface ActionMenuProps {
  editor: Editor | null;
}

const LEFT_MARGIN = 45;

type MenuState = {
  show: boolean;
  pmNode?: ProseMirrorNode;
  domNode?: HTMLElement;
  pos?: number;
  rect?: DOMRect;
};

export const ActionMenu = ({ editor }: ActionMenuProps) => {
  // Do NOT read editor.view during render: @tiptap/react v3 creates the view
  // asynchronously, so editor.view can throw "editor view is not available"
  // in the window before it is attached. Populate the ref in an effect instead.
  const view = useRef<Editor['view']>(null as unknown as Editor['view']);
  const [menuState, setMenuState] = useState<MenuState>({
    show: false,
  });

  // While the block action dropdown is open we freeze the hover-driven
  // menuState (read through the ref inside the mousemove/scroll handlers) so the
  // actions keep targeting the block the menu was opened on.
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const blockMenuOpenRef = useRef(false);

  const setBlockMenu = (open: boolean) => {
    blockMenuOpenRef.current = open;
    setBlockMenuOpen(open);
  };

  useEffect(() => {
    if (editor) {
      view.current = editor.view;
    }
  }, [editor]);

  const { refs, floatingStyles } = useFloating({
    placement: 'left',
    middleware: [offset(-10), shift()],
  });

  useEffect(() => {
    if (menuState.rect) {
      refs.setPositionReference({
        getBoundingClientRect: () => menuState.rect!,
        contextElement: menuState.domNode!,
      });
    }
  }, [menuState.rect, menuState.domNode]);

  useEffect(() => {
    if (editor == null) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      // Keep the handle anchored to its block while the action menu is open.
      if (blockMenuOpenRef.current) {
        return;
      }

      const editorBounds = view.current.dom.getBoundingClientRect();
      const mouseOverEditor =
        event.clientX > editorBounds.left - LEFT_MARGIN &&
        event.clientX < editorBounds.right &&
        event.clientY > editorBounds.top &&
        event.clientY < editorBounds.bottom;

      if (!mouseOverEditor) {
        setMenuState({
          show: false,
        });
        return;
      }

      const pos = view.current.posAtDOM(event.target as Node, 0, 0);
      if (!pos) {
        setMenuState({
          show: false,
        });
        return;
      }

      let currentPos = pos;
      let pmNode = null;
      let domNode = null;
      let nodePos = -1;

      while (currentPos >= 0) {
        const node = view.current.state.doc.nodeAt(currentPos);

        if (!node || !node.isBlock) {
          currentPos--;
          continue;
        }

        if (pmNode && !isDescendantNode(node, pmNode)) {
          currentPos--;
          continue;
        }

        const nodeDOM = view.current.nodeDOM(currentPos) as HTMLElement;
        const nodeDOMElement =
          nodeDOM instanceof HTMLElement
            ? nodeDOM
            : ((nodeDOM as Node)?.parentElement as HTMLElement);

        if (nodeDOMElement) {
          pmNode = node;
          domNode = nodeDOMElement;
          nodePos = currentPos;
        }

        currentPos--;
      }

      if (!pmNode || !domNode) {
        setMenuState({
          show: false,
        });
        return;
      }

      const nodeRect = domNode.getBoundingClientRect();
      const editorRect = editor.view.dom.getBoundingClientRect();
      const menuRect = DOMRect.fromRect({
        x: editorRect.x - 10,
        y: nodeRect.y,
        width: 0,
        height: nodeRect.height,
      });

      setMenuState({
        show: true,
        pmNode,
        domNode,
        pos: nodePos,
        rect: menuRect,
      });
    };

    const handleScroll = () => {
      if (blockMenuOpenRef.current) {
        return;
      }
      setMenuState({
        show: false,
      });
    };

    editor.view.dom.addEventListener('mousemove', handleMouseMove);
    editor.view.dom.addEventListener('scroll', handleScroll, true);

    return () => {
      editor.view.dom.removeEventListener('mousemove', handleMouseMove);
      editor.view.dom.removeEventListener('scroll', handleScroll, true);
    };
  }, [editor]);

  if (editor == null || !menuState.show) {
    return null;
  }

  // Insert an empty paragraph directly below the hovered block, then focus it.
  const insertBlock = () => {
    if (menuState.pos === undefined || !menuState.pmNode) {
      return;
    }

    const insertPos = menuState.pos + menuState.pmNode.nodeSize;
    editor
      .chain()
      .insertContentAt(insertPos, { type: 'paragraph' })
      .focus()
      .run();
  };

  // Duplicate the hovered block by re-inserting its own serialized content
  // immediately after it (composes the existing insertContentAt command).
  const duplicateBlock = () => {
    if (menuState.pos === undefined || !menuState.pmNode) {
      return;
    }

    const insertPos = menuState.pos + menuState.pmNode.nodeSize;
    editor
      .chain()
      .insertContentAt(insertPos, menuState.pmNode.toJSON())
      .focus()
      .run();
  };

  const deleteBlock = () => {
    if (menuState.pos === undefined) {
      return;
    }

    editor
      .chain()
      .setNodeSelection(menuState.pos)
      .deleteSelection()
      .focus()
      .run();
  };

  const turnInto = (nodeName: string) => {
    if (menuState.pos === undefined) {
      return;
    }

    editor
      .chain()
      .setTextSelection(menuState.pos + 1)
      .setNode(nodeName)
      .focus()
      .run();
  };

  // "Turn into" only makes sense for text blocks (paragraph/headings); other
  // blocks (lists, embeds, tables…) are left without the sub-menu.
  const canTurnInto = menuState.pmNode?.isTextblock ?? false;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, zIndex: 50 }}
        className="flex items-center text-muted-foreground p-1 mr-2"
      >
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded cursor-pointer hover:bg-input hover:text-foreground"
          aria-label="Insert block below"
          title="Insert block below"
          data-testid="editor-action-menu-insert-button"
          onClick={insertBlock}
        >
          <Plus className="size-4" />
        </button>
        <DropdownMenu
          open={blockMenuOpen}
          onOpenChange={setBlockMenu}
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              draggable={true}
              aria-label="Block options"
              title="Drag to move, click for actions"
              data-testid="editor-action-menu-drag-handle"
              className="flex size-6 items-center justify-center rounded cursor-grab hover:bg-input hover:text-foreground"
              onDragStart={(event) => {
                // A real drag has begun — never leave the menu open behind it.
                setBlockMenu(false);

                if (menuState.pos === undefined || !menuState.domNode) {
                  return;
                }

                view.current.focus();
                view.current.dispatch(
                  view.current.state.tr.setSelection(
                    NodeSelection.create(view.current.state.doc, menuState.pos)
                  )
                );

                const slice = view.current.state.selection.content();
                const { dom, text } = view.current.serializeForClipboard(slice);

                event.dataTransfer.clearData();
                event.dataTransfer.effectAllowed = 'copyMove';
                event.dataTransfer.setData('text/html', dom.innerHTML);
                event.dataTransfer.setData('text/plain', text);
                event.dataTransfer.setDragImage(menuState.domNode, 0, 0);

                view.current.dragging = { slice, move: true };
              }}
              onDragEnd={() => {
                view.current.dispatch(
                  view.current.state.tr.setSelection(
                    TextSelection.create(view.current.state.doc, 1)
                  )
                );

                view.current.dom.blur();
              }}
            >
              <GripVertical className="size-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" className="w-48">
            <DropdownMenuLabel>Block</DropdownMenuLabel>
            {canTurnInto && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex items-center gap-2">
                  <Type className="size-4 text-muted-foreground" />
                  Turn into
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-paragraph"
                    onClick={() => turnInto('paragraph')}
                  >
                    <Pilcrow className="size-4" />
                    Text
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-heading1"
                    onClick={() => turnInto('heading1')}
                  >
                    <Heading1 className="size-4" />
                    Heading 1
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-heading2"
                    onClick={() => turnInto('heading2')}
                  >
                    <Heading2 className="size-4" />
                    Heading 2
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-heading3"
                    onClick={() => turnInto('heading3')}
                  >
                    <Heading3 className="size-4" />
                    Heading 3
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem
              data-testid="editor-action-menu-duplicate"
              onClick={duplicateBlock}
            >
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="editor-action-menu-delete"
              onClick={deleteBlock}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </FloatingPortal>
  );
};
