import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Terminal, FileDiff, Copy, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NiceModal from '@ebay/nice-modal-react';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { useDiffSummary } from '@/hooks/useDiffSummary';
import { useDevServer } from '@/hooks/useDevServer';
import { Button } from '@/components/ui/button';
import { IdeIcon } from '@/components/ide/IdeIcon';
import { useUserSystem } from '@/components/config-provider';
import { getIdeName } from '@/components/ide/IdeIcon';
import { useProject } from '@/contexts/project-context';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type NextActionCardProps = {
  attemptId?: string;
  containerRef?: string | null;
  failed: boolean;
};

export function NextActionCard({
  attemptId,
  containerRef,
  failed,
}: NextActionCardProps) {
  const { t } = useTranslation('tasks');
  const { config } = useUserSystem();
  const { project } = useProject();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const openInEditor = useOpenInEditor(attemptId);
  const { fileCount, added, deleted, error } = useDiffSummary(
    attemptId ?? null
  );
  const {
    start,
    stop,
    isStarting,
    isStopping,
    runningDevServer,
    latestDevServerProcess,
  } = useDevServer(attemptId);

  const projectHasDevScript = Boolean(project?.dev_script);
  const canShowStartStop = runningDevServer || projectHasDevScript;

  const handleCopy = useCallback(async () => {
    if (!containerRef) return;

    try {
      await navigator.clipboard.writeText(containerRef);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  }, [containerRef]);

  const handleOpenInEditor = useCallback(() => {
    openInEditor();
  }, [openInEditor]);

  const handleViewLogs = useCallback(() => {
    if (attemptId) {
      NiceModal.show('view-processes', {
        attemptId,
        initialProcessId: latestDevServerProcess?.id,
      });
    }
  }, [attemptId, latestDevServerProcess?.id]);

  const handleOpenDiffs = useCallback(() => {
    navigate({ search: '?view=diffs' });
  }, [navigate]);

  const editorName = getIdeName(config?.editor?.editor_type);

  // Necessary to prevent this component being displayed beyond fold within Virtualised List
  if (!failed && fileCount === 0) {
    return <div className="h-24"></div>;
  }

  return (
    <TooltipProvider>
      <div className="pt-4 pb-8">
        <div
          className={`px-3 py-1 text-background flex ${failed ? 'bg-destructive' : 'bg-foreground'}`}
        >
          <span className="font-semibold flex-1">
            {t('attempt.labels.summaryAndActions')}
          </span>
        </div>
        <div
          className={`border px-3 py-2 flex items-center gap-3 min-w-0 ${failed ? 'border-destructive' : 'border-foreground'}`}
        >
          {/* Left: Diff summary */}
          {!error && (
            <button
              onClick={handleOpenDiffs}
              className="flex items-center gap-1.5 text-sm shrink-0 cursor-pointer hover:underline transition-all"
              aria-label={t('attempt.diffs')}
            >
              <span>{t('diff.filesChanged', { count: fileCount })}</span>
              <span className="opacity-50">•</span>
              <span className="text-green-600 dark:text-green-400">
                +{added}
              </span>
              <span className="opacity-50">•</span>
              <span className="text-red-600 dark:text-red-400">-{deleted}</span>
            </button>
          )}

          <div className="flex-1" />

          {/* Right: Icon buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={handleOpenDiffs}
                  aria-label={t('attempt.diffs')}
                >
                  <FileDiff className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('attempt.diffs')}</TooltipContent>
            </Tooltip>

            {containerRef && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={handleCopy}
                    aria-label={t('attempt.clickToCopy')}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {copied ? t('attempt.copied') : t('attempt.clickToCopy')}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={handleOpenInEditor}
                  disabled={!attemptId}
                  aria-label={t('attempt.openInEditor', { editor: editorName })}
                >
                  <IdeIcon
                    editorType={config?.editor?.editor_type}
                    className="h-3.5 w-3.5"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('attempt.openInEditor', { editor: editorName })}
              </TooltipContent>
            </Tooltip>

            {canShowStartStop && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={runningDevServer ? () => stop() : () => start()}
                    disabled={
                      (runningDevServer ? isStopping : isStarting) || !attemptId
                    }
                    aria-label={
                      runningDevServer
                        ? t('attempt.pauseDev')
                        : t('attempt.startDev')
                    }
                  >
                    {runningDevServer ? (
                      <Pause className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {runningDevServer
                    ? t('attempt.pauseDev')
                    : t('attempt.startDev')}
                </TooltipContent>
              </Tooltip>
            )}

            {latestDevServerProcess && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={handleViewLogs}
                    disabled={!attemptId}
                    aria-label={t('attempt.viewDevLogs')}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('attempt.viewDevLogs')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
