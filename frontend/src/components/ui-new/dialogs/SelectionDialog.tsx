import { useState, useCallback, useRef } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { CommandDialog } from '@/components/ui-new/primitives/Command';
import { CommandBar } from '@/components/ui-new/primitives/CommandBar';
import type {
  ResolvedGroup,
  ResolvedGroupItem,
  StatusItem,
} from '@/components/ui-new/actions/pages';
import { resolveLabel } from '@/components/ui-new/actions';

export interface SelectionPage<TResult = unknown> {
  id: string;
  title: string;
  buildGroups: () => ResolvedGroup[];
  onSelect: (
    item: ResolvedGroupItem
  ) =>
    | { type: 'complete'; data: TResult }
    | { type: 'navigate'; pageId: string };
}

export interface SelectionDialogProps {
  initialPageId: string;
  pages: Record<string, SelectionPage>;
  statuses?: StatusItem[];
}

const SelectionDialogImpl = NiceModal.create<SelectionDialogProps>(
  ({ initialPageId, pages, statuses = [] }) => {
    const modal = useModal();
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const [search, setSearch] = useState('');
    const [currentPageId, setCurrentPageId] = useState(initialPageId);
    const [pageStack, setPageStack] = useState<string[]>([]);

    // Capture focus on mount
    if (!previousFocusRef.current && modal.visible) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    const currentPage = pages[currentPageId];

    const resolvedPage = {
      id: currentPage.id,
      title: currentPage.title,
      groups: currentPage.buildGroups(),
    };

    const handleSelect = useCallback(
      (item: ResolvedGroupItem) => {
        const result = currentPage.onSelect(item);
        if (result.type === 'complete') {
          modal.resolve(result.data);
          modal.hide();
        } else if (result.type === 'navigate') {
          setPageStack((prev) => [...prev, currentPageId]);
          setCurrentPageId(result.pageId);
          setSearch('');
        }
      },
      [currentPage, currentPageId, modal]
    );

    const handleGoBack = useCallback(() => {
      const prevPage = pageStack[pageStack.length - 1];
      if (prevPage) {
        setPageStack((prev) => prev.slice(0, -1));
        setCurrentPageId(prevPage);
        setSearch('');
      }
    }, [pageStack]);

    const handleClose = useCallback(() => {
      modal.resolve(undefined);
      modal.hide();
    }, [modal]);

    const handleCloseAutoFocus = useCallback((event: Event) => {
      event.preventDefault();
      const activeElement = document.activeElement;
      const isInDialog = activeElement?.closest('[role="dialog"]');
      if (!isInDialog) {
        previousFocusRef.current?.focus();
      }
    }, []);

    return (
      <CommandDialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleClose()}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <CommandBar
          page={resolvedPage}
          canGoBack={pageStack.length > 0}
          onGoBack={handleGoBack}
          onSelect={handleSelect}
          getLabel={(action) => resolveLabel(action)}
          search={search}
          onSearchChange={setSearch}
          statuses={statuses}
        />
      </CommandDialog>
    );
  }
);

export const SelectionDialog = defineModal<
  SelectionDialogProps,
  unknown | undefined
>(SelectionDialogImpl);
