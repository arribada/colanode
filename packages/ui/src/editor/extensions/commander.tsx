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
import { Editor, Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import {
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { EditorCommand, EditorContext } from '@colanode/client/types';
import {
  ScrollArea,
  ScrollViewport,
  ScrollBar,
} from '@colanode/ui/components/ui/scroll-area';
import { updateScrollView } from '@colanode/ui/lib/utils';

interface CommanderOptions {
  commands: EditorCommand[];
  context: EditorContext | null;
}

const navigationKeys = ['ArrowUp', 'ArrowDown', 'Enter'];

type CommandGroupId =
  | 'ai'
  | 'basic'
  | 'layout'
  | 'media'
  | 'embeds'
  | 'database'
  | 'pages'
  | 'other';

interface CommandGroupDefinition {
  id: CommandGroupId;
  label: string;
}

// Slash-menu sections, in display order. Commands are bucketed by their `key`
// (see commandGroupByKey); any command whose key is not mapped falls into the
// trailing "Other" section so nothing silently disappears from the menu.
const commandGroups: CommandGroupDefinition[] = [
  { id: 'ai', label: 'AI' },
  { id: 'basic', label: 'Basic blocks' },
  { id: 'layout', label: 'Layout' },
  { id: 'media', label: 'Media' },
  { id: 'embeds', label: 'Embeds' },
  { id: 'database', label: 'Database' },
  { id: 'pages', label: 'Pages & files' },
  { id: 'other', label: 'Other' },
];

const fallbackGroupId: CommandGroupId = 'other';

// Maps each existing slash command (by its `key`) to a section above. Derived
// from the commands registered in document-editor.tsx.
const commandGroupByKey: Record<string, CommandGroupId> = {
  ai: 'ai',
  paragraph: 'basic',
  heading1: 'basic',
  heading2: 'basic',
  heading3: 'basic',
  todo: 'basic',
  'bullet-list': 'basic',
  'ordered-list': 'basic',
  toggle: 'basic',
  blockquote: 'basic',
  callout: 'basic',
  'code-block': 'basic',
  divider: 'basic',
  columns: 'layout',
  table: 'layout',
  'table-of-contents': 'layout',
  whiteboard: 'media',
  mermaid: 'media',
  'math-block': 'media',
  'math-inline': 'media',
  bookmark: 'embeds',
  embed: 'embeds',
  plane: 'embeds',
  database: 'database',
  'database-inline': 'database',
  'database-link': 'database',
  page: 'pages',
  file: 'pages',
  folder: 'pages',
};

interface RenderedCommandGroup {
  definition: CommandGroupDefinition;
  items: EditorCommand[];
  offset: number;
}

// Buckets the (already query-filtered) commands into sections, preserving the
// incoming order within each section and dropping empty sections. `orderedItems`
// is the flat list in render order, used to drive keyboard navigation so the
// highlighted item always matches what is shown; `offset` is a group's start
// index within `orderedItems`.
const groupCommands = (
  commands: EditorCommand[]
): { groups: RenderedCommandGroup[]; orderedItems: EditorCommand[] } => {
  const buckets = new Map<CommandGroupId, EditorCommand[]>();
  for (const command of commands) {
    const groupId = commandGroupByKey[command.key] ?? fallbackGroupId;
    const bucket = buckets.get(groupId);
    if (bucket) {
      bucket.push(command);
    } else {
      buckets.set(groupId, [command]);
    }
  }

  const groups: RenderedCommandGroup[] = [];
  const orderedItems: EditorCommand[] = [];
  for (const definition of commandGroups) {
    const items = buckets.get(definition.id);
    if (items && items.length > 0) {
      groups.push({ definition, items, offset: orderedItems.length });
      orderedItems.push(...items);
    }
  }

  return { groups, orderedItems };
};

const filterCommands = ({
  query,
  commands,
}: {
  query: string;
  commands: EditorCommand[];
}) =>
  commands.filter((command) => {
    if (query.length > 0) {
      const search = query.toLowerCase();
      return (
        command.name.toLowerCase().includes(search) ||
        command.description.toLowerCase().includes(search) ||
        (command.keywords &&
          command.keywords.some((keyword: string) => keyword.includes(search)))
      );
    }
    return true;
  });

const CommandList = ({
  items,
  command,
  range,
  props,
}: {
  items: EditorCommand[];
  command: (item: EditorCommand, range: Range) => void;
  range: Range;
  props: SuggestionProps<EditorCommand>;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Group the filtered commands into labelled sections. `orderedItems` is the
  // flat list in render order that keyboard navigation runs over, so arrow keys
  // and the highlight stay in sync with the grouped layout.
  const { groups, orderedItems } = useMemo(
    () => groupCommands(items),
    [items]
  );

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
      const item = orderedItems[index];
      if (item) {
        command(item, range);
      }
    },
    [command, orderedItems, range]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (navigationKeys.includes(e.key)) {
        e.preventDefault();
        if (orderedItems.length === 0) {
          return false;
        }
        if (e.key === 'ArrowUp') {
          setSelectedIndex(
            (selectedIndex + orderedItems.length - 1) % orderedItems.length
          );
          return true;
        }
        if (e.key === 'ArrowDown') {
          setSelectedIndex((selectedIndex + 1) % orderedItems.length);
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
  }, [orderedItems, selectedIndex, setSelectedIndex, selectItem]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [orderedItems]);

  const scrollContainer = useRef<HTMLDivElement>(null);
  const listContainer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // Section headers make the selected button no longer the Nth child, so look
    // it up by its flat index rather than by child position.
    const item = listContainer.current?.querySelector<HTMLElement>(
      `[data-command-index="${selectedIndex}"]`
    );

    if (item && scrollContainer.current) {
      updateScrollView(scrollContainer.current, item);
    }
  }, [selectedIndex]);

  return orderedItems.length > 0 ? (
    <FloatingPortal>
      <div ref={refs.setFloating} style={{ ...floatingStyles, zIndex: 60 }}>
        <div
          id="slash-command"
          role="listbox"
          data-testid="editor-slash-menu"
          className="z-50 min-w-32 w-80 rounded-md border bg-popover text-popover-foreground p-1 shadow-md animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 overflow-hidden"
        >
          <ScrollArea className="h-80">
            <ScrollViewport ref={scrollContainer}>
              <div ref={listContainer}>
                {groups.map((group) => (
                  <div
                    key={group.definition.id}
                    role="group"
                    aria-label={group.definition.label}
                  >
                    <div className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground select-none">
                      {group.definition.label}
                    </div>
                    {group.items.map((item: EditorCommand, itemIndex: number) => {
                      const index = group.offset + itemIndex;
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === selectedIndex}
                          data-command-index={index}
                          data-testid={`editor-command-${item.key}`}
                          className={`relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left outline-hidden select-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground ${
                            index === selectedIndex
                              ? 'bg-accent text-accent-foreground'
                              : ''
                          }`}
                          key={item.key}
                          onClick={() => selectItem(index)}
                          onPointerDownCapture={(e) => {
                            // Added this event handler because the onClick handler was not working
                            e.preventDefault();
                            e.stopPropagation();
                            selectItem(index);
                          }}
                        >
                          <div className="flex size-10 min-w-10 items-center justify-center rounded-md border bg-background">
                            <item.icon className="size-4 text-foreground" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
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

  return {
    onStart: (props: SuggestionProps<EditorCommand>) => {
      component = new ReactRenderer(CommandList, {
        props: {
          ...props,
          props,
        },
        editor: props.editor,
      });
    },
    onUpdate: (props: SuggestionProps<EditorCommand>) => {
      component?.updateProps({
        ...props,
        props,
      });
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
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
    },
  };
};

export const CommanderExtension = Extension.create<CommanderOptions>({
  name: 'commander',
  addOptions() {
    return {
      commands: [],
      context: {} as EditorContext,
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        pluginKey: new PluginKey('slashCommandSuggestion'),
        command: async ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: EditorCommand;
        }) => {
          const result = props.handler({
            editor,
            range,
            context: this.options.context,
          });

          if (result instanceof Promise) {
            await result;
          }
        },
        items: ({ query }: { query: string }) =>
          filterCommands({ query, commands: this.options.commands }),
        render: renderItems,
      }),
    ];
  },
});
