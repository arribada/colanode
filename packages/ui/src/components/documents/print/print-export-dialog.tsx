// ABOUTME: "Print / PDF" options dialog — pick sub-pages / appendix / TOC /
// ABOUTME: cover, render the pages off-screen, assemble one document, print it.
import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { Loader2, Printer } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { LocalNode, LocalPageNode, LocalRecordNode } from '@colanode/client/types';
import {
  PrintRenderer,
  RenderedPage,
} from '@colanode/ui/components/documents/print/print-renderer';
import { Button } from '@colanode/ui/components/ui/button';
import { Checkbox } from '@colanode/ui/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery as useColanodeLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { getCoverClass, isImageCover } from '@colanode/ui/lib/covers';
import { printHtmlDocument } from '@colanode/ui/lib/print';
import {
  assemblePrintHtml,
  collectPageTree,
  extractMentionTargets,
  PRINT_EXPORT_CSS,
  PrintChapter,
  PrintCover,
} from '@colanode/ui/lib/print-export';
import {
  buildDocumentLink,
  buildRevisionRows,
} from '@colanode/ui/lib/print-layout';
import { applyPrintLayout } from '@colanode/ui/lib/print-layout-dom';

interface PrintExportDialogProps {
  page: LocalPageNode | LocalRecordNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = 'idle' | 'chapters' | 'appendix';

const Option = ({
  checked,
  onChange,
  label,
  desc,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="flex items-start gap-2 rounded-md p-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
  >
    <Checkbox checked={checked} className="pointer-events-none mt-0.5" />
    <span>
      <span className="text-sm font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{desc}</span>
    </span>
  </button>
);

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

export const PrintExportDialog = ({
  page,
  open,
  onOpenChange,
}: PrintExportDialogProps) => {
  const workspace = useWorkspace();

  const [subpages, setSubpages] = useState(true);
  const [appendix, setAppendix] = useState(false);
  const [toc, setToc] = useState(true);
  const [cover, setCover] = useState(true);

  const [phase, setPhase] = useState<Phase>('idle');
  const [activePages, setActivePages] = useState<LocalNode[]>([]);
  const chaptersRef = useRef<PrintChapter[]>([]);
  const depthRef = useRef<Map<string, number>>(new Map());

  const pagesQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.rootId, page.rootId)),
    [workspace.userId, page.rootId]
  );
  const allPages = useMemo<LocalNode[]>(() => {
    const pages = (pagesQuery.data ?? []).filter(
      (n) => n.type === 'page'
    ) as unknown as LocalNode[];
    // The node being exported must always be present. A database RECORD is not
    // type 'page', so it would otherwise be filtered out here and the export
    // would come back blank (only the cover). Add it explicitly.
    if (!pages.some((p) => p.id === page.id)) {
      pages.unshift(page as unknown as LocalNode);
    }
    return pages;
  }, [pagesQuery.data, page]);

  const tree = useMemo(
    () => collectPageTree(page.id, allPages),
    [page.id, allPages]
  );
  const subCount = tree.length - 1;

  // Version history: the page's cut tags and who cut each one, resolved to
  // display names together with the page's creator.
  const pageAsPage = page as LocalPageNode;
  const versionLog = useMemo(
    () => pageAsPage.versionLog ?? [],
    [pageAsPage.versionLog]
  );
  const authorIds = useMemo(
    () =>
      Array.from(
        new Set(
          [page.createdBy, ...versionLog.map((entry) => entry.by)].filter(
            Boolean
          )
        )
      ),
    [page.createdBy, versionLog]
  );
  const authorsQuery = useLiveQuery(
    (q) =>
      q
        .from({ users: workspace.collections.users })
        .where(({ users }) => inArray(users.id, authorIds))
        .select(({ users }) => ({ id: users.id, name: users.name })),
    [workspace.userId, authorIds.join(',')]
  );

  // The page cover, printed once on the cover page. An uploaded image is an
  // avatar id resolved through the local asset cache; a preset is a class.
  const pageCover = pageAsPage.cover ?? null;
  const coverImageValue = isImageCover(pageCover) ? pageCover.value : null;
  const coverAvatarId =
    coverImageValue && !/^https?:\/\//.test(coverImageValue)
      ? coverImageValue
      : null;
  const coverAvatarQuery = useColanodeLiveQuery(
    {
      type: 'avatar.get',
      accountId: workspace.accountId,
      avatarId: coverAvatarId ?? '',
    },
    { enabled: coverAvatarId !== null }
  );

  const busy = phase !== 'idle';

  const start = () => {
    const entries = subpages ? tree : [{ id: page.id, depth: 0 }];
    depthRef.current = new Map(entries.map((e) => [e.id, e.depth]));
    const nodes = entries
      .map((e) => allPages.find((p) => p.id === e.id))
      .filter((n): n is LocalNode => Boolean(n));
    chaptersRef.current = [];
    setActivePages(nodes);
    setPhase('chapters');
  };

  const finalize = (appendixChapters: PrintChapter[]) => {
    const names = new Map(
      (authorsQuery.data ?? []).map((user) => [user.id, user.name])
    );
    const revisions = buildRevisionRows({
      versionLog,
      currentVersion: pageAsPage.version,
      createdAt: page.createdAt,
      createdBy: page.createdBy,
      authorName: (userId) => names.get(userId) ?? 'Unknown',
      formatDate,
    });
    const lastAuthorId = versionLog.at(-1)?.by ?? page.createdBy;

    const printCover: PrintCover | null =
      pageCover === null
        ? null
        : {
            imageUrl: coverAvatarId
              ? (coverAvatarQuery.data?.url ?? null)
              : coverImageValue,
            className: isImageCover(pageCover)
              ? null
              : getCoverClass(pageCover),
          };

    // The browser proposes the document title as the PDF's file name. A page
    // with a version tag gets it appended, so exported files tell versions apart.
    const fileTitle = pageAsPage.version
      ? `${page.name || 'Document'} ${pageAsPage.version}`
      : page.name || 'Document';

    const body = assemblePrintHtml({
      documentTitle: page.name || 'Document',
      date: new Date().toLocaleDateString(),
      author: names.get(lastAuthorId) ?? '',
      version: pageAsPage.version ?? revisions[0]?.version ?? '',
      cover: printCover,
      documentLink: buildDocumentLink(
        typeof window !== 'undefined' ? window.location.origin : null,
        workspace.workspaceId,
        page.id
      ),
      revisions,
      chapters: chaptersRef.current,
      appendix: appendixChapters,
      options: { subpages, appendix, toc, cover },
    });
    printHtmlDocument({
      title: fileTitle,
      bodyHtml: body,
      css: PRINT_EXPORT_CSS,
      withAppStyles: true,
      beforePrint: applyPrintLayout,
    });
    setPhase('idle');
    setActivePages([]);
    onOpenChange(false);
  };

  const onChaptersReady = (rendered: RenderedPage[]) => {
    const chapters: PrintChapter[] = rendered.map((r) => ({
      id: r.id,
      title: r.title,
      html: r.html,
      depth: depthRef.current.get(r.id) ?? 0,
    }));
    chaptersRef.current = chapters;

    if (appendix) {
      const chapterIds = new Set(chapters.map((c) => c.id));
      const targets = new Set<string>();
      chapters.forEach((c) =>
        extractMentionTargets(c.html).forEach((t) => targets.add(t))
      );
      const refPages = allPages.filter(
        (p) => targets.has(p.id) && !chapterIds.has(p.id)
      );
      if (refPages.length > 0) {
        setActivePages(refPages);
        setPhase('appendix');
        return;
      }
    }
    finalize([]);
  };

  const onAppendixReady = (rendered: RenderedPage[]) => {
    finalize(
      rendered.map((r) => ({
        id: r.id,
        title: r.title,
        html: r.html,
        depth: 0,
      }))
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print / PDF</DialogTitle>
            <DialogDescription>
              Choose what to include. Your browser&apos;s print dialog opens when
              it is ready — pick &ldquo;Save as PDF&rdquo;.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            <Option
              checked={subpages}
              onChange={setSubpages}
              disabled={subCount === 0}
              label={`Include sub-pages${subCount > 0 ? ` (${subCount})` : ''}`}
              desc="Each page becomes its own chapter."
            />
            <Option
              checked={appendix}
              onChange={setAppendix}
              label="Referenced pages as appendix"
              desc="Pages linked from the content are added at the end."
            />
            <Option
              checked={toc}
              onChange={setToc}
              label="Table of contents"
              desc="Chapters, or — for a single page — its headings."
            />
            <Option
              checked={cover}
              onChange={setCover}
              label="Cover page"
              desc="The page's cover, title, version, date and author."
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Page numbers and a document control page with the revision history
            are added automatically. Wide tables and large images get a
            landscape page of their own.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="button" onClick={start} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <Printer className="size-4" />
                  Export
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {phase !== 'idle' && (
        <PrintRenderer
          key={phase}
          pages={activePages}
          onReady={phase === 'chapters' ? onChaptersReady : onAppendixReady}
        />
      )}
    </>
  );
};
