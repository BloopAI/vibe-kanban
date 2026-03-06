import { useCallback, useEffect, useReducer, useRef } from 'react';

const PREVIEW_CLOSE_DELAY_MS = 120;

export type WorkspaceSidebarMode = 'pinned-open' | 'preview-open' | 'closed';
type PreviewSource = 'appbar' | 'handle' | null;
type CloseDelayState = 'idle' | 'scheduled';

type State = {
  mode: WorkspaceSidebarMode;
  previewSource: PreviewSource;
  closeDelayState: CloseDelayState;
};

type Action =
  | { type: 'PIN' }
  | { type: 'UNPIN' }
  | { type: 'OPEN_PREVIEW'; source: Exclude<PreviewSource, null> }
  | { type: 'SCHEDULE_CLOSE' }
  | { type: 'CANCEL_CLOSE' }
  | { type: 'CLOSE' };

const CLOSED_STATE: State = {
  mode: 'closed',
  previewSource: null,
  closeDelayState: 'idle',
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'PIN':
      return {
        mode: 'pinned-open',
        previewSource: null,
        closeDelayState: 'idle',
      };
    case 'UNPIN':
      return CLOSED_STATE;
    case 'OPEN_PREVIEW':
      if (state.mode === 'pinned-open') {
        return state;
      }
      return {
        mode: 'preview-open',
        previewSource: action.source,
        closeDelayState: 'idle',
      };
    case 'SCHEDULE_CLOSE':
      if (state.mode !== 'preview-open') {
        return state;
      }
      return {
        ...state,
        closeDelayState: 'scheduled',
      };
    case 'CANCEL_CLOSE':
      if (state.mode !== 'preview-open') {
        return state;
      }
      return {
        ...state,
        closeDelayState: 'idle',
      };
    case 'CLOSE':
      if (state.mode === 'pinned-open') {
        return state;
      }
      return CLOSED_STATE;
    default:
      return state;
  }
}

export function useWorkspaceSidebarVisibilityController({
  isPinned,
  isAppBarHovered,
}: {
  isPinned: boolean;
  isAppBarHovered: boolean;
}) {
  const [state, dispatch] = useReducer(
    reducer,
    isPinned
      ? {
          mode: 'pinned-open' as const,
          previewSource: null,
          closeDelayState: 'idle' as const,
        }
      : CLOSED_STATE
  );
  const closeTimeoutRef = useRef<number | null>(null);
  const hoverStateRef = useRef({
    isAppBarHovered,
    isHandleHovered: false,
    isPreviewHovered: false,
  });

  const clearScheduledClose = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const closePreviewImmediately = useCallback(() => {
    clearScheduledClose();
    dispatch({ type: 'CLOSE' });
  }, [clearScheduledClose]);

  const scheduleCloseIfIdle = useCallback(() => {
    if (isPinned) {
      return;
    }

    const { isAppBarHovered, isHandleHovered, isPreviewHovered } =
      hoverStateRef.current;
    if (isAppBarHovered || isHandleHovered || isPreviewHovered) {
      clearScheduledClose();
      dispatch({ type: 'CANCEL_CLOSE' });
      return;
    }

    clearScheduledClose();
    dispatch({ type: 'SCHEDULE_CLOSE' });
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      const {
        isAppBarHovered: latestAppBarHover,
        isHandleHovered: latestHandleHover,
        isPreviewHovered: latestPreviewHover,
      } = hoverStateRef.current;
      if (latestAppBarHover || latestHandleHover || latestPreviewHover) {
        dispatch({ type: 'CANCEL_CLOSE' });
        return;
      }
      dispatch({ type: 'CLOSE' });
    }, PREVIEW_CLOSE_DELAY_MS);
  }, [clearScheduledClose, isPinned]);

  const openPreview = useCallback(
    (source: Exclude<PreviewSource, null>) => {
      if (isPinned) {
        return;
      }
      clearScheduledClose();
      dispatch({ type: 'OPEN_PREVIEW', source });
    },
    [clearScheduledClose, isPinned]
  );

  useEffect(() => {
    hoverStateRef.current.isAppBarHovered = isAppBarHovered;

    if (isPinned) {
      return;
    }

    if (isAppBarHovered) {
      openPreview('appbar');
      return;
    }

    scheduleCloseIfIdle();
  }, [isAppBarHovered, isPinned, openPreview, scheduleCloseIfIdle]);

  useEffect(() => {
    hoverStateRef.current.isHandleHovered = false;
    hoverStateRef.current.isPreviewHovered = false;
    clearScheduledClose();

    if (isPinned) {
      dispatch({ type: 'PIN' });
      return;
    }

    dispatch({ type: 'UNPIN' });
  }, [clearScheduledClose, isPinned]);

  useEffect(() => () => clearScheduledClose(), [clearScheduledClose]);

  const handleHandleHoverStart = useCallback(() => {
    hoverStateRef.current.isHandleHovered = true;
    openPreview('handle');
  }, [openPreview]);

  const handleHandleHoverEnd = useCallback(() => {
    hoverStateRef.current.isHandleHovered = false;
    scheduleCloseIfIdle();
  }, [scheduleCloseIfIdle]);

  const handlePreviewHoverStart = useCallback(() => {
    hoverStateRef.current.isPreviewHovered = true;
    clearScheduledClose();
    if (!isPinned) {
      dispatch({ type: 'CANCEL_CLOSE' });
    }
  }, [clearScheduledClose, isPinned]);

  const handlePreviewHoverEnd = useCallback(() => {
    hoverStateRef.current.isPreviewHovered = false;
    scheduleCloseIfIdle();
  }, [scheduleCloseIfIdle]);

  return {
    mode: state.mode,
    isPreviewOpen: state.mode === 'preview-open',
    isPreviewClosingScheduled: state.closeDelayState === 'scheduled',
    previewSource: state.previewSource,
    closePreviewImmediately,
    handleHandleHoverStart,
    handleHandleHoverEnd,
    handlePreviewHoverStart,
    handlePreviewHoverEnd,
  };
}
