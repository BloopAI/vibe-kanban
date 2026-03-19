import { useCallback, useEffect, useRef, type RefObject } from 'react';

export const PANEL_FIND_EVENT = 'vk-open-panel-find';

type PanelKind = 'conversation' | 'diffs';

interface PanelFindDetail {
  panel?: PanelKind;
  action?: 'open' | 'close';
  from?: PanelKind;
}

interface UsePanelFindShortcutParams {
  panel: PanelKind;
  otherPanel: PanelKind;
  panelRef: RefObject<HTMLElement | null>;
  showSearch: boolean;
  setShowSearch: (value: boolean) => void;
  focusSearchInput: () => void;
  closeSearchState: () => void;
}

export function usePanelFindShortcut({
  panel,
  otherPanel,
  panelRef,
  showSearch,
  setShowSearch,
  focusSearchInput,
  closeSearchState,
}: UsePanelFindShortcutParams): void {
  const openedFromPanelRef = useRef<PanelKind | null>(null);

  const closeOtherPanelSearchIfOpen = useCallback(() => {
    const otherPanelEl = document.querySelector<HTMLElement>(
      `[data-vk-search-panel="${otherPanel}"]`
    );
    if (!otherPanelEl || otherPanelEl.dataset.vkSearchOpen !== 'true') return;

    window.dispatchEvent(
      new CustomEvent(PANEL_FIND_EVENT, {
        detail: {
          panel: otherPanel,
          action: 'close',
        } satisfies PanelFindDetail,
      })
    );
  }, [otherPanel]);

  const tryOpenOtherPanelSearch = useCallback((): boolean => {
    const otherPanelEl = document.querySelector<HTMLElement>(
      `[data-vk-search-panel="${otherPanel}"]`
    );
    if (!otherPanelEl) return false;
    if (otherPanelEl.dataset.vkSearchOpen === 'true') return false;

    closeSearchState();
    window.dispatchEvent(
      new CustomEvent(PANEL_FIND_EVENT, {
        detail: {
          panel: otherPanel,
          action: 'open',
          from: panel,
        } satisfies PanelFindDetail,
      })
    );
    return true;
  }, [closeSearchState, otherPanel, panel]);

  useEffect(() => {
    if (!showSearch) return;
    focusSearchInput();
  }, [focusSearchInput, showSearch]);

  useEffect(() => {
    const handleOpenPanelFind = (event: Event) => {
      const customEvent = event as CustomEvent<PanelFindDetail>;
      if (customEvent.detail?.panel !== panel) return;

      if (customEvent.detail?.action === 'close') {
        openedFromPanelRef.current = null;
        closeSearchState();
        return;
      }

      if (showSearch) return;
      openedFromPanelRef.current =
        customEvent.detail?.from === otherPanel ? otherPanel : null;
      setShowSearch(true);
      focusSearchInput();
    };

    window.addEventListener(PANEL_FIND_EVENT, handleOpenPanelFind);
    return () => {
      window.removeEventListener(PANEL_FIND_EVENT, handleOpenPanelFind);
    };
  }, [
    closeSearchState,
    focusSearchInput,
    otherPanel,
    panel,
    setShowSearch,
    showSearch,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
      if (!isFindShortcut) return;

      const target = event.target as Node | null;
      if (!panelRef.current || !target || !panelRef.current.contains(target)) {
        return;
      }

      if (showSearch) {
        if (openedFromPanelRef.current === otherPanel) {
          openedFromPanelRef.current = null;
          closeSearchState();
          return;
        }

        if (tryOpenOtherPanelSearch()) {
          event.preventDefault();
          return;
        }

        closeSearchState();
        return;
      }

      event.preventDefault();
      openedFromPanelRef.current = null;
      closeOtherPanelSearchIfOpen();
      setShowSearch(true);
      focusSearchInput();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    closeOtherPanelSearchIfOpen,
    closeSearchState,
    focusSearchInput,
    otherPanel,
    panelRef,
    setShowSearch,
    showSearch,
    tryOpenOtherPanelSearch,
  ]);
}
