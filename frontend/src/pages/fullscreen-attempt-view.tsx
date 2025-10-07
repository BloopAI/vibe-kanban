import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Loader } from '@/components/ui/loader';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';
import { AttemptTabs } from '@/components/attempts/AttemptTabs';
import { AttemptLogsPane } from '@/components/attempts/AttemptLogsPane';
import { PreviewPlaceholder } from '@/components/attempts/PreviewPlaceholder';
import { DiffsPlaceholder } from '@/components/attempts/DiffsPlaceholder';
import ResponsiveTwoPane from '@/components/layout/ResponsiveTwoPane';
import { NewCard, NewCardHeader } from '@/components/ui/new-card';

type ViewMode = 'preview' | 'diffs';

interface FullscreenAttemptViewProps {
  mode: ViewMode;
}

export function FullscreenAttemptView({ mode }: FullscreenAttemptViewProps) {
  const { projectId, taskId, attemptId } = useParams<{
    projectId: string;
    taskId: string;
    attemptId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isLatest = attemptId === 'latest';
  const { data: attempts = [], isLoading: isAttemptsLoading } = useTaskAttempts(
    taskId,
    { enabled: !!taskId && isLatest }
  );

  const latestAttemptId = useMemo(() => {
    if (!attempts?.length) return undefined;
    return [...attempts].sort((a, b) => {
      const diff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    })[0].id;
  }, [attempts]);

  useEffect(() => {
    if (!projectId || !taskId || !isLatest || isAttemptsLoading) return;

    const currentPath = location.pathname;
    const tabSuffix = currentPath.endsWith('/preview')
      ? '/preview'
      : currentPath.endsWith('/diffs')
        ? '/diffs'
        : '/preview';

    if (!latestAttemptId) {
      navigate(`/projects/${projectId}/tasks/${taskId}`, { replace: true });
      return;
    }

    navigate(
      `/projects/${projectId}/tasks/${taskId}/attempts/${latestAttemptId}/full${tabSuffix}`,
      { replace: true }
    );
  }, [
    projectId,
    taskId,
    isLatest,
    isAttemptsLoading,
    latestAttemptId,
    location.pathname,
    navigate,
  ]);

  const effectiveAttemptId = attemptId === 'latest' ? undefined : attemptId;
  const { data: attempt, isLoading: isAttemptLoading } =
    useTaskAttempt(effectiveAttemptId);

  if (isLatest && isAttemptsLoading) {
    return <Loader message="Resolving latest attempt..." size={32} />;
  }

  if (isAttemptLoading || !attempt) {
    return <Loader message="Loading attempt..." size={32} />;
  }

  const handleClose = () => {
    if (projectId) {
      navigate(`/projects/${projectId}/tasks`, { replace: true });
    }
  };

  const leftPane = <AttemptLogsPane attempt={attempt} />;
  const rightPane =
    mode === 'preview' ? <PreviewPlaceholder /> : <DiffsPlaceholder />;

  return (
    <div className="h-full flex flex-col">
      <NewCard className="flex-1 min-h-0 flex flex-col">
        <NewCardHeader actions={<AttemptHeaderActions onClose={handleClose} />}>
          <AttemptTabs />
        </NewCardHeader>
        <div className="flex-1 min-h-0">
          <ResponsiveTwoPane
            left={leftPane}
            right={rightPane}
            isRightOpen={true}
            variant="split"
          />
        </div>
      </NewCard>
    </div>
  );
}
