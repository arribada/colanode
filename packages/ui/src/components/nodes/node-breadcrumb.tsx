import { Fragment, useLayoutEffect, useRef, useState } from 'react';

import { LocalNode } from '@colanode/client/types';
import { NodeBreadcrumbItem } from '@colanode/ui/components/nodes/node-breadcrumb-item';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@colanode/ui/components/ui/breadcrumb';
import { Link } from '@colanode/ui/components/ui/link';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { splitBreadcrumb } from '@colanode/ui/lib/node-path';

interface NodeBreadcrumbProps {
  nodes: LocalNode[];
}

const ITEM_CLASS =
  'max-w-[180px] cursor-pointer truncate hover:text-foreground [&_span]:truncate';

// Leaving the "More" trigger for its popover crosses a small gap; closing only
// after this delay keeps the popover from vanishing on the way.
const HOVER_CLOSE_DELAY_MS = 150;

const BreadcrumbLink = ({ node }: { node: LocalNode }) => (
  <BreadcrumbItem className={ITEM_CLASS}>
    <Link from="/workspace/$userId" to="$nodeId" params={{ nodeId: node.id }}>
      <NodeBreadcrumbItem node={node} />
    </Link>
  </BreadcrumbItem>
);

export const NodeBreadcrumb = ({ nodes }: NodeBreadcrumbProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Now that titles no longer carry numeric prefixes, the path is what tells
  // two "Requirements" pages apart, so it folds only when it truly does not
  // fit. An invisible copy of the full path is measured against the space the
  // header leaves, on every resize and every rename along the path.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      return;
    }

    const update = () => {
      setOverflowing(measure.scrollWidth > container.clientWidth + 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [nodes]);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openMore = () => {
    cancelClose();
    setMoreOpen(true);
  };

  const closeMoreSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(
      () => setMoreOpen(false),
      HOVER_CLOSE_DELAY_MS
    );
  };

  const { head, hidden, tail } = splitBreadcrumb(nodes, overflowing);

  return (
    // overflow-hidden: the invisible measuring copy below is as wide as the
    // whole path, and the header row around it scrolls sideways otherwise.
    <div ref={containerRef} className="relative flex min-w-0 grow overflow-hidden">
      <Breadcrumb className="flex min-w-0 grow">
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          {head.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbLink node={item} />
            </Fragment>
          ))}
          {hidden.length > 0 && (
            <Fragment>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                  <PopoverTrigger
                    className="flex items-center gap-1"
                    aria-label="Show the full path"
                    data-testid="breadcrumb-more"
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'mouse') {
                        openMore();
                      }
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType === 'mouse') {
                        closeMoreSoon();
                      }
                    }}
                    onClick={(event) => {
                      // Radix toggles on click, so a click right after the
                      // hover opened it would close it again, and a tap (which
                      // fires both) would never show it. A click only opens;
                      // an outside click or Escape closes.
                      event.preventDefault();
                      openMore();
                    }}
                  >
                    <BreadcrumbEllipsis className="h-4 w-4" />
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-auto max-w-md p-2"
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'mouse') {
                        openMore();
                      }
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType === 'mouse') {
                        closeMoreSoon();
                      }
                    }}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                  >
                    <ol className="flex flex-col gap-0.5 text-sm">
                      {nodes.map((item, depth) => {
                        const isCurrent = depth === nodes.length - 1;
                        return (
                          <li
                            key={item.id}
                            style={{ paddingLeft: depth * 12 }}
                            className="min-w-0"
                          >
                            {isCurrent ? (
                              <span className="flex min-w-0 items-center rounded px-1.5 py-1 font-medium [&_span]:truncate">
                                <NodeBreadcrumbItem node={item} />
                              </span>
                            ) : (
                              <Link
                                from="/workspace/$userId"
                                to="$nodeId"
                                params={{ nodeId: item.id }}
                                className="flex min-w-0 items-center rounded px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground [&_span]:truncate"
                                onClick={() => setMoreOpen(false)}
                              >
                                <NodeBreadcrumbItem node={item} />
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </PopoverContent>
                </Popover>
              </BreadcrumbItem>
            </Fragment>
          )}
          {tail.map((item) => (
            <Fragment key={item.id}>
              <BreadcrumbSeparator />
              <BreadcrumbLink node={item} />
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 flex w-max"
      >
        <BreadcrumbList className="flex-nowrap">
          {nodes.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className={ITEM_CLASS}>
                <NodeBreadcrumbItem node={item} />
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </div>
    </div>
  );
};
