import { useCallback } from 'react';
import { PreviewBrowser } from '../views/PreviewBrowser';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { usePreviewUrl } from '../hooks/usePreviewUrl';
import { useLogStream } from '@/hooks/useLogStream';
import { useLayoutStore } from '@/stores/useLayoutStore';

interface PreviewBrowserContainerProps {
  attemptId?: string;
  className?: string;
}

export function PreviewBrowserContainer({
  attemptId,
  className,
}: PreviewBrowserContainerProps) {
  const previewRefreshKey = useLayoutStore((s) => s.previewRefreshKey);

  const { start, isStarting, runningDevServer, latestDevServerProcess } =
    usePreviewDevServer(attemptId);

  const { logs } = useLogStream(latestDevServerProcess?.id ?? '');
  const urlInfo = usePreviewUrl(logs);

  const handleStart = useCallback(() => {
    start();
  }, [start]);

  // Use previewRefreshKey from store to force iframe reload
  const iframeUrl = urlInfo?.url
    ? `${urlInfo.url}${urlInfo.url.includes('?') ? '&' : '?'}_refresh=${previewRefreshKey}`
    : undefined;

  return (
    <PreviewBrowser
      url={iframeUrl}
      onStart={handleStart}
      isStarting={isStarting}
      hasDevScript={true}
      isServerRunning={Boolean(runningDevServer)}
      className={className}
    />
  );
}
