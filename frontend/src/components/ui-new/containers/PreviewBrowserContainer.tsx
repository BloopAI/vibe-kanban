import { useCallback } from 'react';
import { PreviewBrowser } from '../views/PreviewBrowser';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { usePreviewUrl } from '../hooks/usePreviewUrl';
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
  const { repos } = useWorkspaceContext();

  const { start, isStarting, runningDevServers } =
    usePreviewDevServer(attemptId);

  const primaryDevServer = runningDevServers[0];
  const { logs } = useLogStream(primaryDevServer?.id ?? '');
  const urlInfo = usePreviewUrl(logs);

  const handleStart = useCallback(() => {
    start();
  }, [start]);

  // Use previewRefreshKey from store to force iframe reload
  const iframeUrl = urlInfo?.url
    ? `${urlInfo.url}${urlInfo.url.includes('?') ? '&' : '?'}_refresh=${previewRefreshKey}`
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

    ScriptFixerDialog.show({
      scriptType: 'dev_server',
      repos,
      workspaceId: attemptId,
      initialRepoId: repos.length === 1 ? repos[0].id : undefined,
    });
  }, [attemptId, repos]);

  return (
    <PreviewBrowser
      url={iframeUrl}
      onStart={handleStart}
      isStarting={isStarting}
      isServerRunning={runningDevServers.length > 0}
      repos={repos}
      handleEditDevScript={handleEditDevScript}
      handleFixDevScript={attemptId && repos.length > 0 ? handleFixDevScript : undefined}
      className={className}
    />
  );
}
