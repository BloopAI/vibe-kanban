import { useCallback, useEffect, useRef, useState } from 'react';

const PREVIEW_CLOSE_DELAY_MS = 120;

export function useWorkspaceSidebarPreviewController({
  enabled,
  isAppBarHovered,
}: {
  enabled: boolean;
  isAppBarHovered: boolean;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
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

  const scheduleCloseIfIdle = useCallback(() => {
    if (!enabled) {
      return;
    }

    const { isAppBarHovered, isHandleHovered, isPreviewHovered } =
      hoverStateRef.current;
    if (isAppBarHovered || isHandleHovered || isPreviewHovered) {
      clearScheduledClose();
      return;
    }

    clearScheduledClose();
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      const {
        isAppBarHovered: latestAppBarHover,
        isHandleHovered: latestHandleHover,
        isPreviewHovered: latestPreviewHover,
      } = hoverStateRef.current;
      if (latestAppBarHover || latestHandleHover || latestPreviewHover) {
        return;
      }
      setIsPreviewOpen(false);
    }, PREVIEW_CLOSE_DELAY_MS);
  }, [clearScheduledClose, enabled]);

  useEffect(() => {
    hoverStateRef.current.isAppBarHovered = isAppBarHovered;

    if (!enabled) {
      clearScheduledClose();
      setIsPreviewOpen(false);
      return;
    }

    if (isAppBarHovered) {
      clearScheduledClose();
      setIsPreviewOpen(true);
      return;
    }

    scheduleCloseIfIdle();
  }, [clearScheduledClose, enabled, isAppBarHovered, scheduleCloseIfIdle]);

  useEffect(() => {
    hoverStateRef.current.isHandleHovered = false;
    hoverStateRef.current.isPreviewHovered = false;
    clearScheduledClose();

    if (!enabled) {
      setIsPreviewOpen(false);
    }
  }, [clearScheduledClose, enabled]);

  useEffect(() => () => clearScheduledClose(), [clearScheduledClose]);

  const handleHandleHoverStart = useCallback(() => {
    if (!enabled) {
      return;
    }
    hoverStateRef.current.isHandleHovered = true;
    clearScheduledClose();
    setIsPreviewOpen(true);
  }, [clearScheduledClose, enabled]);

  const handleHandleHoverEnd = useCallback(() => {
    hoverStateRef.current.isHandleHovered = false;
    scheduleCloseIfIdle();
  }, [scheduleCloseIfIdle]);

  const handlePreviewHoverStart = useCallback(() => {
    if (!enabled) {
      return;
    }
    hoverStateRef.current.isPreviewHovered = true;
    clearScheduledClose();
    setIsPreviewOpen(true);
  }, [clearScheduledClose, enabled]);

  const handlePreviewHoverEnd = useCallback(() => {
    hoverStateRef.current.isPreviewHovered = false;
    scheduleCloseIfIdle();
  }, [scheduleCloseIfIdle]);

  return {
    isPreviewOpen,
    handleHandleHoverStart,
    handleHandleHoverEnd,
    handlePreviewHoverStart,
    handlePreviewHoverEnd,
  };
}
