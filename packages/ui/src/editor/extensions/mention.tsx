import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
  VirtualElement,
} from '@floating-ui/react';
import type { Range } from '@tiptap/core';
import { Editor, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import {
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { EditorContext, LocalNode, User } from '@colanode/client/types';
import { generateId, IdType, NodeType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  ScrollArea,
  ScrollViewport,
  ScrollBar,
} from '@colanode/ui/components/ui/scroll-area';
import { MentionNodeView } from '@colanode/ui/editor/views';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';
import { updateScrollView } from '@colanode/ui/lib/utils';

declare module '@tiptap/core' {
  interface Storage {
    mention: {
      isOpen: boolean;
    };
  }
}

interface MentionOptions {
  context: EditorContext | null;
}

export type MentionUserItem = {
  type: 'user';
  user: User;
};

export type MentionNodeItem = {
  type: 'node';
  node: LocalNode;
};

export type MentionItem = MentionUserItem | MentionNodeItem;

const MENTIONABLE_NODE_TYPES: NodeType[] = ['page', 'database', 'record'];

const navigationKeys = ['ArrowUp', 'ArrowDown', 'Enter'];

const getMentionItemId = (item: MentionItem): string =>
  item.type === 'user' ? item.user.id : item.node.id;

const MentionItemButton = ({
  item,
  index,
  isSelected,
  onSelect,
}: {
  item: MentionItem;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
}) => {
  const id = getMentionItemId(item);
  const name =
    item.type === 'user' ? item.user.name : getMentionNodeDisplay(item.node).name;
  const avatar =
    item.type === 'user'
      ? item.user.avatar
      : getMentionNodeDisplay(item.node).avatar;
  const secondary =
    item.type === 'user'
      ? item.user.email
      : getMentionNodeDisplay(item.node).label;

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      data-mention-index={index}
      data-testid={`editor-mention-item-${id}`}
      className={`relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left outline-hidden select-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground ${
        isSelected ? 'bg-accent text-accent-foreground' : ''
      }`}
      onClick={() => onSelect(index)}
      onPointerDownCapture={(e) => {
        // Added this event handler because the onClick handler was not working
        e.preventDefault();
        e.stopPropagation();
        onSelect(index);
      }}
    >
      <div className="flex size-10 min-w-10 items-center justify-center rounded-md border bg-background">
        <Avatar id={id} name={name} avatar={avatar} className="size-8" />
      </div>
      <div className="flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{secondary}</p>
      </div>
    </button>
  );
};

const CommandList = ({
  items,
  command,
  range,
  props,
}: {
  items: MentionItem[];
  command: (item: MentionItem, range: Range) => void;
  range: Range;
  props: SuggestionProps<MentionItem>;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { refs, floatingStyles, update } = useFloating({
    placement: 'bottom-start',
    middleware: [offset(6), flip(), shift()],
    whileElementsMounted: autoUpdate,
    strategy: 'fixed',
  });

  useLayoutEffect(() => {
    const rect = props.clientRect?.();
    if (!rect) return;

    const virtualEl = {
      getBoundingClientRect: () => rect,
      contextElement: props.editor.view.dom as Element,
    };

    refs.setPositionReference(virtualEl as VirtualElement);
    update();
  }, [props.clientRect, props.editor.view.dom, refs, update]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        command(item, range);
      }
    },
    [command, items, range]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (navigationKeys.includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowUp') {
          setSelectedIndex((selectedIndex + items.length - 1) % items.length);
          return true;
        }
        if (e.key === 'ArrowDown') {
          setSelectedIndex((selectedIndex + 1) % items.length);
          return true;
        }
        if (e.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      }

      return false;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [items, selectedIndex, setSelectedIndex, selectItem]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const scrollContainer = useRef<HTMLDivElement>(null);
  const listContainer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const item = listContainer?.current?.querySelector(
      `[data-mention-index="${selectedIndex}"]`
    ) as HTMLElement | null;

    if (item && scrollContainer?.current) {
      updateScrollView(scrollContainer.current, item);
    }
  }, [selectedIndex]);

  const userItems = items.filter(
    (item): item is MentionUserItem => item.type === 'user'
  );
  const nodeItems = items.filter(
    (item): item is MentionNodeItem => item.type === 'node'
  );

  return items.length > 0 ? (
    <FloatingPortal>
      <div ref={refs.setFloating} style={{ ...floatingStyles, zIndex: 60 }}>
        <div
          id="mention-command"
          role="listbox"
          data-testid="editor-mention-menu"
          className="z-50 min-w-32 w-80 rounded-md border bg-popover text-popover-foreground p-1 shadow-md animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 overflow-hidden"
        >
          <ScrollArea className="h-80">
            <ScrollViewport ref={scrollContainer}>
              <div ref={listContainer}>
                {userItems.length > 0 && (
                  <p className="px-2 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
                    People
                  </p>
                )}
                {userItems.map((item, index) => (
                  <MentionItemButton
                    key={item.user.id}
                    item={item}
                    index={index}
                    isSelected={index === selectedIndex}
                    onSelect={selectItem}
                  />
                ))}
                {nodeItems.length > 0 && (
                  <p className="px-2 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
                    Pages
                  </p>
                )}
                {nodeItems.map((item, index) => (
                  <MentionItemButton
                    key={item.node.id}
                    item={item}
                    index={userItems.length + index}
                    isSelected={userItems.length + index === selectedIndex}
                    onSelect={selectItem}
                  />
                ))}
              </div>
            </ScrollViewport>
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>
      </div>
    </FloatingPortal>
  ) : null;
};

const renderItems = () => {
  let component: ReactRenderer | null = null;
  let editor: Editor | null = null;

  return {
    onStart: (props: SuggestionProps<MentionItem>) => {
      editor = props.editor;
      props.editor.storage.mention.isOpen = true;

      component = new ReactRenderer(CommandList, {
        props: {
          ...props,
          props,
        },
        editor: props.editor,
      });
    },
    onUpdate: (props: SuggestionProps<MentionItem>) => {
      props.editor.storage.mention.isOpen = true;
      component?.updateProps({
        ...props,
        props,
      });
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (editor) {
        editor.storage.mention.isOpen = true;
      }

      if (props.event.key === 'Escape') {
        return true;
      }

      if (navigationKeys.includes(props.event.key)) {
        return true;
      }

      // @ts-expect-error Component ref type is complex
      return component?.ref?.onKeyDown(props);
    },
    onExit: () => {
      component?.destroy();
      if (editor) {
        editor.storage.mention.isOpen = false;
      }
    },
  };
};

export const MentionExtension = Node.create<MentionOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
      },
      target: {
        default: null,
      },
    };
  },
  addOptions() {
    return {
      context: {} as EditorContext,
    };
  },
  addStorage() {
    return {
      isOpen: false,
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(MentionNodeView, {
      as: 'mention',
      className: 'inline-flex',
    });
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '@',
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: MentionItem;
        }) => {
          // increase range.to by one when the next node is of type "text"
          // and starts with a space character
          const nodeAfter = editor.view.state.selection.$to.nodeAfter;
          const overrideSpace = nodeAfter?.text?.startsWith(' ');

          if (overrideSpace) {
            range.to += 1;
          }

          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: this.name,
                attrs: {
                  id: generateId(IdType.Mention),
                  target: getMentionItemId(props),
                },
              },
              {
                type: 'text',
                text: ' ',
              },
            ])
            .run();

          window.getSelection()?.collapseToEnd();
        },
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          const type = state.schema.nodes[this.name];
          if (!type) return false;
          return !!$from.parent.type.contentMatch.matchType(type);
        },
        items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
          if (!this.options.context) {
            return [];
          }

          const { userId, documentId } = this.options.context;

          const [users, nodes] = await Promise.all([
            window.colanode.executeQuery({
              type: 'user.search',
              userId,
              searchQuery: query,
              exclude: [userId],
            }),
            window.colanode.executeQuery({
              type: 'node.mention.search',
              userId,
              searchQuery: query,
              types: MENTIONABLE_NODE_TYPES,
              exclude: [documentId],
              limit: 10,
            }),
          ]);

          return [
            ...users.map((user): MentionItem => ({ type: 'user', user })),
            ...nodes.map((node): MentionItem => ({ type: 'node', node })),
          ];
        },
        render: renderItems,
      }),
    ];
  },
});
