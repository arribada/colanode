import { useFloating, shift, offset, FloatingPortal } from '@floating-ui/react';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { Editor } from '@tiptap/react';
import {
  Baseline,
  ChevronRight,
  Code,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  List,
  ListOrdered,
  ListTodo,
  Megaphone,
  MessageSquarePlus,
  Palette,
  PencilLine,
  Pilcrow,
  Plus,
  Quote,
  Trash2,
  Type,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import { findBlockFromPos, isDescendantNode } from '@colanode/client/lib';
import { generateId, IdType } from '@colanode/core';
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
import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

interface ActionMenuProps {
  editor: Editor | null;
  // Provided only for page documents (mirrors the toolbar). When present, the
  // block menu offers "Comment" / "Suggest edit" wired to the same panels.
  onAddComment?: (threadId: string) => void;
  onSuggestEdit?: (blockId: string) => void;
}

const LEFT_MARGIN = 45;

type MenuState = {
  show: boolean;
  pmNode?: ProseMirrorNode;
  domNode?: HTMLElement;
  pos?: number;
  rect?: DOMRect;
};

export const ActionMenu = ({
  editor,
  onAddComment,
  onSuggestEdit,
}: ActionMenuProps) => {
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
  // Set when the menu was summoned via the keyboard shortcut rather than by
  // hovering, so closing it also tears down the (otherwise mouse-driven) handle
  // instead of leaving it stranded on the page.
  const keyboardOpenedRef = useRef(false);
  // True from a grip drag's start until its end, so the click the browser would
  // otherwise synthesize on release cannot pop the actions menu after a reorder.
  const draggingRef = useRef(false);
  // Bumped whenever a hover re-targets the handle. Captured when a
  // keyboard-opened menu closes so a hover landing in the one-frame gap before
  // the deferred hide below can veto that hide.
  const hoverSeqRef = useRef(0);

  const setBlockMenu = (open: boolean) => {
    blockMenuOpenRef.current = open;
    setBlockMenuOpen(open);
    if (!open && keyboardOpenedRef.current) {
      keyboardOpenedRef.current = false;
      // Let Radix finish its own close sequence (focus return + exit) with the
      // component still mounted before the hover handle is removed. If a fresh
      // hover has re-targeted the handle in that frame, it wins: leave it.
      const hoverSeqAtClose = hoverSeqRef.current;
      window.requestAnimationFrame(() => {
        if (
          !blockMenuOpenRef.current &&
          hoverSeqRef.current === hoverSeqAtClose
        ) {
          setMenuState({ show: false });
        }
      });
    }
  };

  useEffect(() => {
    if (editor) {
      view.current = editor.view;
    }
  }, [editor]);

  const { refs, floatingStyles } = useFloating({
    placement: 'left',
    middleware: [offset(-4), shift()],
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
      if (pos == null || pos < 0) {
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
      const menuRect = DOMRect.fromRect({
        // Anchor to the block's own left edge, i.e. its text, not the editor box
        // edge which sits against the sidebar. The handle then lives in the
        // block's left margin inside the content area, never over the sidebar,
        // and it follows the text horizontally when the side panel is resized.
        x: nodeRect.x,
        y: nodeRect.y,
        width: 0,
        height: nodeRect.height,
      });

      hoverSeqRef.current += 1;
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

    // The handle's X is derived from the editor's left edge, but it is only
    // recomputed on mousemove/keydown. When the side panel is resized the
    // editor reflows and shifts horizontally, leaving the handle stranded
    // over the sidebar with a stale X until the next mousemove. Hide it on
    // any layout resize (same hide the scroll handler uses); it reappears at
    // the correct position on the next hover.
    const handleResize = () => {
      if (blockMenuOpenRef.current) {
        return;
      }
      setMenuState({
        show: false,
      });
    };
    const resizeObserver = new ResizeObserver(handleResize);

    // Keyboard entry point: Mod-/ (Ctrl/Cmd + /) opens the block action menu for
    // the top-level block containing the current selection — the same block the
    // hover handle resolves — so the actions are reachable without a mouse.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!editor.isEditable || blockMenuOpenRef.current) {
        return;
      }

      if (
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key !== '/'
      ) {
        return;
      }

      const { selection } = view.current.state;

      let targetPos: number;
      let targetNode: ProseMirrorNode;
      if (selection instanceof NodeSelection) {
        targetPos = selection.from;
        targetNode = selection.node;
      } else {
        const $from = selection.$from;
        if ($from.depth === 0) {
          return;
        }
        targetPos = $from.before(1);
        targetNode = $from.node(1);
      }

      const nodeDOM = view.current.nodeDOM(targetPos);
      const domNode =
        nodeDOM instanceof HTMLElement
          ? nodeDOM
          : ((nodeDOM as Node)?.parentElement as HTMLElement | null);
      if (!domNode) {
        return;
      }

      event.preventDefault();

      const nodeRect = domNode.getBoundingClientRect();
      const editorRect = view.current.dom.getBoundingClientRect();
      const menuRect = DOMRect.fromRect({
        x: editorRect.x - 10,
        y: nodeRect.y,
        width: 0,
        height: nodeRect.height,
      });

      // Freeze the hover handler immediately, render the handle at the block,
      // then open the dropdown on the next frame so Radix anchors to the
      // now-positioned trigger.
      blockMenuOpenRef.current = true;
      keyboardOpenedRef.current = true;
      setMenuState({
        show: true,
        pmNode: targetNode,
        domNode,
        pos: targetPos,
        rect: menuRect,
      });
      window.requestAnimationFrame(() => {
        setBlockMenuOpen(true);
      });
    };

    editor.view.dom.addEventListener('mousemove', handleMouseMove);
    editor.view.dom.addEventListener('scroll', handleScroll, true);
    editor.view.dom.addEventListener('keydown', handleKeyDown);
    resizeObserver.observe(editor.view.dom);
    window.addEventListener('resize', handleResize);

    return () => {
      editor.view.dom.removeEventListener('mousemove', handleMouseMove);
      editor.view.dom.removeEventListener('scroll', handleScroll, true);
      editor.view.dom.removeEventListener('keydown', handleKeyDown);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
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

  // Convert the hovered block to a type whose slash command is more than a bare
  // setNode (lists, toggle, code, quote, callout): reuse the exact chain those
  // commands run, seeded from a selection inside the block instead of a range.
  const turnIntoWith = (
    apply: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>
  ) => {
    if (menuState.pos === undefined) {
      return;
    }

    apply(editor.chain().setTextSelection(menuState.pos + 1)).focus().run();
  };

  // The full text range of the hovered block — used to color/highlight or
  // comment on all of its text at once.
  const blockTextRange = () => {
    if (menuState.pos === undefined || !menuState.pmNode) {
      return null;
    }

    return {
      from: menuState.pos + 1,
      to: menuState.pos + menuState.pmNode.nodeSize - 1,
    };
  };

  const setBlockColor = (color: string) => {
    const range = blockTextRange();
    if (!range) {
      return;
    }

    const chain = editor.chain().setTextSelection(range);
    if (color === 'default') {
      chain.unsetColor();
    } else {
      chain.setColor(color);
    }
    chain.focus().run();
  };

  const setBlockHighlight = (color: string) => {
    const range = blockTextRange();
    if (!range) {
      return;
    }

    const chain = editor.chain().setTextSelection(range);
    if (color === 'default') {
      chain.unsetHighlight();
    } else {
      chain.setHighlight(color);
    }
    chain.focus().run();
  };

  // Comment on the whole block: select its text, reuse an existing thread if the
  // block already carries a comment mark, else open a fresh one, then hand the
  // thread id to the page's comments panel (same entry point as the toolbar).
  const commentBlock = () => {
    const range = blockTextRange();
    if (!range || !onAddComment) {
      return;
    }

    editor.chain().setTextSelection(range).run();
    const existing = editor.getAttributes('comment')?.threadId as
      | string
      | undefined;
    const threadId = existing ?? generateId(IdType.CommentThread);
    if (!existing) {
      editor.chain().focus().setComment(threadId).run();
    }
    onAddComment(threadId);
  };

  // Suggest an edit to the block: derive its top-level block id the same way the
  // toolbar's SuggestButton does and open the suggestion composer for it.
  const suggestBlock = () => {
    if (menuState.pos === undefined || !onSuggestEdit) {
      return;
    }

    editor.chain().setTextSelection(menuState.pos + 1).run();
    const { $from } = editor.state.selection;
    const topLevel = $from.depth >= 1 ? $from.node(1) : null;
    const blockId =
      (topLevel?.attrs?.id as string | undefined) ??
      findBlockFromPos($from)?.nodeId;
    if (blockId) {
      onSuggestEdit(blockId);
    }
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, zIndex: 50 }}
        className="flex items-center -space-x-0.5 text-muted-foreground p-0.5"
      >
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded cursor-pointer hover:bg-input hover:text-foreground"
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
          <div
            role="button"
            tabIndex={0}
            draggable={true}
            aria-haspopup="menu"
            aria-expanded={blockMenuOpen}
            aria-label="Block options"
            title="Drag to move, click or press Ctrl/Cmd + / for actions"
            data-testid="editor-action-menu-drag-handle"
            className="relative flex size-5 items-center justify-center rounded cursor-grab hover:bg-input hover:text-foreground"
            onClick={() => {
              // The browser suppresses the click that follows a real drag, so
              // reaching here means a clean press-release: open the actions
              // menu. draggingRef is a belt-and-braces guard on that ordering.
              if (draggingRef.current) {
                return;
              }
              setBlockMenu(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setBlockMenu(true);
              }
            }}
            onDragStart={(event) => {
              // A real drag has begun: flag it so the trailing click is ignored,
              // and never leave the menu open behind it.
              draggingRef.current = true;
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
              // Let ProseMirror's own drop selection stand: no forced caret
              // reset, no blur. Just clear the drag flag for the next click.
              draggingRef.current = false;
            }}
          >
            <GripVertical className="size-4" />
            {/*
              Zero-interaction anchor for the controlled dropdown: it positions
              against this box, but pointer-events-none keeps every press on the
              grip itself. A real Radix trigger opens (and preventDefaults) on
              pointer-down, which fights and breaks the native drag.
            */}
            <DropdownMenuTrigger asChild>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              />
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent
            align="start"
            side="bottom"
            className="w-48"
            onCloseAutoFocus={(event) => {
              // Return focus to the editor (not the hover-only grip) on Escape,
              // item selection, or dismiss.
              event.preventDefault();
              editor.commands.focus();
            }}
          >
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
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-bullet-list"
                    onClick={() => turnIntoWith((c) => c.toggleBulletList())}
                  >
                    <List className="size-4" />
                    Bulleted list
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-ordered-list"
                    onClick={() => turnIntoWith((c) => c.toggleOrderedList())}
                  >
                    <ListOrdered className="size-4" />
                    Numbered list
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-todo"
                    onClick={() => turnIntoWith((c) => c.toggleTaskList())}
                  >
                    <ListTodo className="size-4" />
                    To-do list
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-toggle"
                    onClick={() => turnIntoWith((c) => c.setToggle())}
                  >
                    <ChevronRight className="size-4" />
                    Toggle
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-code"
                    onClick={() => turnIntoWith((c) => c.toggleCodeBlock())}
                  >
                    <Code className="size-4" />
                    Code
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-quote"
                    onClick={() =>
                      turnIntoWith((c) =>
                        c
                          .toggleNode('paragraph', 'paragraph')
                          .toggleBlockquote()
                      )
                    }
                  >
                    <Quote className="size-4" />
                    Quote
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="editor-action-menu-turn-callout"
                    onClick={() => turnIntoWith((c) => c.setCallout())}
                  >
                    <Megaphone className="size-4" />
                    Callout
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {canTurnInto && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex items-center gap-2">
                  <Palette className="size-4 text-muted-foreground" />
                  Color
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 w-44 overflow-y-auto">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Baseline className="size-4 text-muted-foreground" />
                    Text
                  </DropdownMenuLabel>
                  {editorColors.map((color) => (
                    <DropdownMenuItem
                      key={`block-text-${color.color}`}
                      onClick={() => setBlockColor(color.color)}
                    >
                      <span
                        className={cn(
                          'flex size-4 items-center justify-center rounded border text-xs font-medium',
                          color.textClass
                        )}
                      >
                        A
                      </span>
                      {color.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Highlighter className="size-4 text-muted-foreground" />
                    Background
                  </DropdownMenuLabel>
                  {editorColors.map((color) => (
                    <DropdownMenuItem
                      key={`block-bg-${color.color}`}
                      onClick={() => setBlockHighlight(color.color)}
                    >
                      <span
                        className={cn(
                          'flex size-4 items-center justify-center rounded border',
                          color.bgClass
                        )}
                      >
                        A
                      </span>
                      {color.name}
                    </DropdownMenuItem>
                  ))}
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
            {onAddComment && (
              <DropdownMenuItem
                data-testid="editor-action-menu-comment"
                onClick={commentBlock}
              >
                <MessageSquarePlus className="size-4" />
                Comment
              </DropdownMenuItem>
            )}
            {onSuggestEdit && (
              <DropdownMenuItem
                data-testid="editor-action-menu-suggest"
                onClick={suggestBlock}
              >
                <PencilLine className="size-4" />
                Suggest edit
              </DropdownMenuItem>
            )}
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
