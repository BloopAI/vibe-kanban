import {
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  PreviewBrowser,
  MOBILE_WIDTH,
  MOBILE_HEIGHT,
  PHONE_FRAME_PADDING,
} from '../views/PreviewBrowser';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { usePreviewUrl } from '../hooks/usePreviewUrl';
import {
  usePreviewSettings,
  type ScreenSize,
} from '@/hooks/usePreviewSettings';
import { useLogStream } from '@/hooks/useLogStream';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ScriptFixerDialog } from '@/components/dialogs/scripts/ScriptFixerDialog';

const MIN_RESPONSIVE_WIDTH = 320;
const MIN_RESPONSIVE_HEIGHT = 480;

interface PreviewBrowserContainerProps {
  attemptId: string;
  className: string;
}

export function PreviewBrowserContainer({
  attemptId,
  className,
}: PreviewBrowserContainerProps) {
  const previewRefreshKey = useUiPreferencesStore((s) => s.previewRefreshKey);
  const triggerPreviewRefresh = useUiPreferencesStore(
    (s) => s.triggerPreviewRefresh
  );
  const { repos, workspaceId } = useWorkspaceContext();

  const {
    start,
    stop,
    isStarting,
    isStopping,
    runningDevServers,
    devServerProcesses,
  } = usePreviewDevServer(attemptId);

  const primaryDevServer = runningDevServers[0];
  const { logs } = useLogStream(primaryDevServer?.id ?? '');
  const urlInfo = usePreviewUrl(logs);

  // Detect failed dev server process (failed status or completed with non-zero exit code)
  const failedDevServerProcess = devServerProcesses.find(
    (p) =>
      p.status === 'failed' ||
      (p.status === 'completed' && p.exit_code !== null && p.exit_code !== 0n)
  );
  const hasFailedDevServer = Boolean(failedDevServerProcess);

  // Preview settings (URL override and screen size)
  const {
    overrideUrl,
    hasOverride,
    setOverrideUrl,
    clearOverride,
    screenSize,
    responsiveDimensions,
    setScreenSize,
    setResponsiveDimensions,
  } = usePreviewSettings(workspaceId);

  // Use override URL if set, otherwise fall back to auto-detected
  const effectiveUrl = hasOverride ? overrideUrl : urlInfo?.url;

  // Local state for URL input to prevent updates from disrupting typing
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [urlInputValue, setUrlInputValue] = useState(effectiveUrl ?? '');

  // Iframe display timing state
  const [showIframe, setShowIframe] = useState(false);
  const [allowManualUrl, setAllowManualUrl] = useState(false);
  const [immediateLoad, setImmediateLoad] = useState(false);

  // Sync from prop only when input is not focused
  useEffect(() => {
    if (document.activeElement !== urlInputRef.current) {
      setUrlInputValue(effectiveUrl ?? '');
    }
  }, [effectiveUrl]);

  // 10-second timeout to enable manual URL entry when no URL detected
  useEffect(() => {
    if (!runningDevServers.length) {
      setAllowManualUrl(false);
      return;
    }
    if (urlInfo?.url) return; // Already have URL
    const timer = setTimeout(() => setAllowManualUrl(true), 10000);
    return () => clearTimeout(timer);
  }, [runningDevServers.length, urlInfo?.url]);

  // Reset immediateLoad when server stops
  useEffect(() => {
    if (!runningDevServers.length) {
      setImmediateLoad(false);
    }
  }, [runningDevServers.length]);

  // 2-second delay before showing iframe after URL detection
  // When there's an override URL from scratch, wait for server to detect a URL first
  // unless user has triggered an immediate load (refresh/submit)
  useEffect(() => {
    if (!effectiveUrl) {
      setShowIframe(false);
      return;
    }

    // If user has triggered immediate load (refresh/submit), show immediately after delay
    // OR if no override (normal flow), show after delay once effectiveUrl is set
    // OR if we have both override and auto-detected URL (server is ready), show after delay
    const shouldShow = immediateLoad || !hasOverride || urlInfo?.url;

    if (!shouldShow) {
      setShowIframe(false);
      return;
    }

    setShowIframe(false);
    const timer = setTimeout(() => setShowIframe(true), 2000);
    return () => clearTimeout(timer);
  }, [
    effectiveUrl,
    previewRefreshKey,
    immediateLoad,
    hasOverride,
    urlInfo?.url,
  ]);

  // Responsive resize state - use refs for values that shouldn't trigger re-renders
  const [localDimensions, setLocalDimensions] = useState(responsiveDimensions);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const resizeDirectionRef = useRef<'right' | 'bottom' | 'corner' | null>(null);
  const localDimensionsRef = useRef(localDimensions);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const startDimensionsRef = useRef<{ width: number; height: number } | null>(
    null
  );

  // Store callback in ref to avoid effect re-runs when callback identity changes
  const setResponsiveDimensionsRef = useRef(setResponsiveDimensions);
  useEffect(() => {
    setResponsiveDimensionsRef.current = setResponsiveDimensions;
  }, [setResponsiveDimensions]);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    localDimensionsRef.current = localDimensions;
  }, [localDimensions]);

  // Sync local dimensions with prop when not resizing
  useEffect(() => {
    if (!isResizingRef.current) {
      setLocalDimensions(responsiveDimensions);
    }
  }, [responsiveDimensions]);

  // Calculate scale for mobile preview to fit container
  const [mobileScale, setMobileScale] = useState(1);

  useLayoutEffect(() => {
    if (screenSize !== 'mobile' || !containerRef.current) {
      setMobileScale(1);
      return;
    }

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;

      // Get available space (subtract padding from p-double which is typically 32px total)
      const availableWidth = container.clientWidth - 32;
      const availableHeight = container.clientHeight - 32;

      // Total phone frame dimensions including padding
      const totalFrameWidth = MOBILE_WIDTH + PHONE_FRAME_PADDING;
      const totalFrameHeight = MOBILE_HEIGHT + PHONE_FRAME_PADDING;

      // Calculate scale needed to fit
      const scaleX = availableWidth / totalFrameWidth;
      const scaleY = availableHeight / totalFrameHeight;
      const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down

      setMobileScale(scale);
    };

    updateScale();

    // Observe container size changes
    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [screenSize]);

  // Handle resize events - register listeners once on mount
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (
        !isResizingRef.current ||
        !startPosRef.current ||
        !startDimensionsRef.current
      )
        return;

      const direction = resizeDirectionRef.current;
      const deltaX = clientX - startPosRef.current.x;
      const deltaY = clientY - startPosRef.current.y;

      setLocalDimensions(() => {
        let newWidth = startDimensionsRef.current!.width;
        let newHeight = startDimensionsRef.current!.height;

        if (direction === 'right' || direction === 'corner') {
          // Double delta to compensate for centered element (grows on both sides)
          newWidth = Math.max(
            MIN_RESPONSIVE_WIDTH,
            startDimensionsRef.current!.width + deltaX * 2
          );
        }

        if (direction === 'bottom' || direction === 'corner') {
          // Double delta to compensate for centered element (grows on both sides)
          newHeight = Math.max(
            MIN_RESPONSIVE_HEIGHT,
            startDimensionsRef.current!.height + deltaY * 2
          );
        }

        return { width: newWidth, height: newHeight };
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    };

    const handleEnd = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        resizeDirectionRef.current = null;
        startPosRef.current = null;
        startDimensionsRef.current = null;
        setIsResizing(false);
        setResponsiveDimensionsRef.current(localDimensionsRef.current);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, []); // Empty deps - mount only, uses refs for all external values

  const handleResizeStart = useCallback(
    (direction: 'right' | 'bottom' | 'corner') =>
      (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        resizeDirectionRef.current = direction;
        setIsResizing(true);

        // Capture starting position and dimensions for delta-based resizing
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        startPosRef.current = { x: clientX, y: clientY };
        startDimensionsRef.current = { ...localDimensionsRef.current };
      },
    []
  );

  const handleUrlInputChange = useCallback((value: string) => {
    setUrlInputValue(value);
  }, []);

  const handleUrlSubmit = useCallback(() => {
    const trimmed = urlInputValue.trim();
    if (!trimmed || trimmed === urlInfo?.url) {
      clearOverride();
    } else {
      setOverrideUrl(trimmed);
      setImmediateLoad(true);
    }
  }, [urlInputValue, urlInfo?.url, clearOverride, setOverrideUrl]);

  const handleStart = useCallback(() => {
    start();
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleRefresh = useCallback(() => {
    setImmediateLoad(true);
    triggerPreviewRefresh();
  }, [triggerPreviewRefresh]);

  const handleClearOverride = useCallback(async () => {
    await clearOverride();
    setUrlInputValue('');
  }, [clearOverride]);

  const handleCopyUrl = useCallback(async () => {
    if (effectiveUrl) {
      await navigator.clipboard.writeText(effectiveUrl);
    }
  }, [effectiveUrl]);

  const handleOpenInNewTab = useCallback(() => {
    if (effectiveUrl) {
      window.open(effectiveUrl, '_blank');
    }
  }, [effectiveUrl]);

  const handleScreenSizeChange = useCallback(
    (size: ScreenSize) => {
      setScreenSize(size);
    },
    [setScreenSize]
  );

  // Use previewRefreshKey from store to force iframe reload
  const iframeUrl = effectiveUrl
    ? `${effectiveUrl}${effectiveUrl.includes('?') ? '&' : '?'}_refresh=${previewRefreshKey}`
    : undefined;

  const handleEditDevScript = useCallback(() => {
    if (!attemptId || repos.length === 0) return;

    const sessionId = devServerProcesses[0]?.session_id;

    ScriptFixerDialog.show({
      scriptType: 'dev_server',
      repos,
      workspaceId: attemptId,
      sessionId,
      initialRepoId: repos.length === 1 ? repos[0].id : undefined,
    });
  }, [attemptId, repos, devServerProcesses]);

  const handleFixDevScript = useCallback(() => {
    if (!attemptId || repos.length === 0) return;

    // Get session ID from the latest dev server process
    const sessionId = devServerProcesses[0]?.session_id;

    ScriptFixerDialog.show({
      scriptType: 'dev_server',
      repos,
      workspaceId: attemptId,
      sessionId,
      initialRepoId: repos.length === 1 ? repos[0].id : undefined,
    });
  }, [attemptId, repos, devServerProcesses]);

  return (
    <PreviewBrowser
      url={iframeUrl}
      autoDetectedUrl={urlInfo?.url}
      urlInputValue={urlInputValue}
      urlInputRef={urlInputRef}
      isUsingOverride={hasOverride}
      onUrlInputChange={handleUrlInputChange}
      onUrlSubmit={handleUrlSubmit}
      onClearOverride={handleClearOverride}
      onCopyUrl={handleCopyUrl}
      onOpenInNewTab={handleOpenInNewTab}
      onRefresh={handleRefresh}
      onStart={handleStart}
      onStop={handleStop}
      isStarting={isStarting}
      isStopping={isStopping}
      isServerRunning={runningDevServers.length > 0}
      showIframe={showIframe}
      allowManualUrl={allowManualUrl}
      screenSize={screenSize}
      localDimensions={localDimensions}
      onScreenSizeChange={handleScreenSizeChange}
      onResizeStart={handleResizeStart}
      isResizing={isResizing}
      containerRef={containerRef}
      repos={repos}
      handleEditDevScript={handleEditDevScript}
      handleFixDevScript={
        attemptId && repos.length > 0 ? handleFixDevScript : undefined
      }
      hasFailedDevServer={hasFailedDevServer}
      mobileScale={mobileScale}
      className={className}
    />
  );
}
