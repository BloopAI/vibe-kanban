import { useCallback, useState, useEffect, useRef } from 'react';
import { PreviewBrowser } from '../views/PreviewBrowser';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { usePreviewUrl } from '../hooks/usePreviewUrl';
import {
  usePreviewSettings,
  type ScreenSize,
  type ResponsiveDimensions,
} from '@/hooks/usePreviewSettings';
import { useLogStream } from '@/hooks/useLogStream';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import { ScriptFixerDialog } from '@/components/dialogs/scripts/ScriptFixerDialog';

interface PreviewBrowserContainerProps {
  attemptId?: string;
  className?: string;
}

export function PreviewBrowserContainer({
  attemptId,
  className,
}: PreviewBrowserContainerProps) {
  const navigate = useNavigate();
  const previewRefreshKey = useLayoutStore((s) => s.previewRefreshKey);
  const triggerPreviewRefresh = useLayoutStore((s) => s.triggerPreviewRefresh);
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

  // Sync from prop only when input is not focused
  useEffect(() => {
    if (document.activeElement !== urlInputRef.current) {
      setUrlInputValue(effectiveUrl ?? '');
    }
  }, [effectiveUrl]);

  const handleUrlInputChange = useCallback(
    (value: string) => {
      setUrlInputValue(value);
      setOverrideUrl(value);
    },
    [setOverrideUrl]
  );

  const handleStart = useCallback(() => {
    start();
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleRefresh = useCallback(() => {
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

  const handleResponsiveDimensionsChange = useCallback(
    (dimensions: ResponsiveDimensions) => {
      setResponsiveDimensions(dimensions);
    },
    [setResponsiveDimensions]
  );

  // Use previewRefreshKey from store to force iframe reload
  const iframeUrl = effectiveUrl
    ? `${effectiveUrl}${effectiveUrl.includes('?') ? '&' : '?'}_refresh=${previewRefreshKey}`
    : undefined;

  const handleEditDevScript = () => {
    if (repos.length === 1) {
      navigate(`/settings/repos?repoId=${repos[0].id}`);
    } else {
      navigate('/settings/repos');
    }
  };

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
      onClearOverride={handleClearOverride}
      onCopyUrl={handleCopyUrl}
      onOpenInNewTab={handleOpenInNewTab}
      onRefresh={handleRefresh}
      onStart={handleStart}
      onStop={handleStop}
      isStarting={isStarting}
      isStopping={isStopping}
      isServerRunning={runningDevServers.length > 0}
      screenSize={screenSize}
      responsiveDimensions={responsiveDimensions}
      onScreenSizeChange={handleScreenSizeChange}
      onResponsiveDimensionsChange={handleResponsiveDimensionsChange}
      repos={repos}
      handleEditDevScript={handleEditDevScript}
      handleFixDevScript={
        attemptId && repos.length > 0 ? handleFixDevScript : undefined
      }
      className={className}
    />
  );
}
