import {
  PlayIcon,
  StopIcon,
  ArrowSquareOutIcon,
  ArrowClockwiseIcon,
  SpinnerIcon,
  CopyIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CollapsibleSectionHeader } from '../primitives/CollapsibleSectionHeader';
import { PrimaryButton } from '../primitives/PrimaryButton';
import { VirtualizedProcessLogs } from '../VirtualizedProcessLogs';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';
import { getDevServerWorkingDir } from '@/lib/devServerUtils';
import type { ExecutionProcess, PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface PreviewControlsProps {
  devServerProcesses: ExecutionProcess[];
  activeProcessId: string | null;
  logs: LogEntry[];
  logsError: string | null;
  url?: string;
  onViewFullLogs: () => void;
  onTabChange: (processId: string) => void;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onCopyUrl: () => void;
  onOpenInNewTab: () => void;
  isStarting: boolean;
  isStopping: boolean;
  hasDevScript: boolean;
  isServerRunning: boolean;
  className?: string;
}

export function PreviewControls({
  devServerProcesses,
  activeProcessId,
  logs,
  logsError,
  url,
  onViewFullLogs,
  onTabChange,
  onStart,
  onStop,
  onRefresh,
  onCopyUrl,
  onOpenInNewTab,
  isStarting,
  isStopping,
  hasDevScript,
  isServerRunning,
  className,
}: PreviewControlsProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const isLoading = isStarting || (isServerRunning && !url);

  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col overflow-hidden',
        className
      )}
    >
      <CollapsibleSectionHeader
        title="Dev Server"
        persistKey={PERSIST_KEYS.devServerSection}
        contentClassName="flex flex-col flex-1 overflow-hidden"
      >
        <div className="flex items-center gap-half p-base">
          {url && (
            <div className="flex items-center gap-half bg-panel rounded-sm px-base py-half flex-1 min-w-0">
              <span className="flex-1 font-mono text-sm text-low truncate">
                {url}
              </span>
              <button
                type="button"
                onClick={onCopyUrl}
                className="text-low hover:text-normal"
                aria-label="Copy URL"
              >
                <CopyIcon className="size-icon-sm" />
              </button>
              <button
                type="button"
                onClick={onOpenInNewTab}
                className="text-low hover:text-normal"
                aria-label="Open in new tab"
              >
                <ArrowSquareOutIcon className="size-icon-sm" />
              </button>
              <button
                type="button"
                onClick={onRefresh}
                className="text-low hover:text-normal"
                aria-label="Refresh"
              >
                <ArrowClockwiseIcon className="size-icon-sm" />
              </button>
            </div>
          )}

          {isServerRunning ? (
            <PrimaryButton
              variant="tertiary"
              value={t('preview.browser.stopButton')}
              actionIcon={isStopping ? 'spinner' : StopIcon}
              onClick={onStop}
              disabled={isStopping}
            />
          ) : hasDevScript ? (
            <PrimaryButton
              value={t('preview.browser.startingButton')}
              actionIcon={isStarting ? 'spinner' : PlayIcon}
              onClick={onStart}
              disabled={isStarting}
            />
          ) : (
            <p className="text-sm text-low">{t('preview.noDevScript')}</p>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-base pb-half">
            <span className="text-xs font-medium text-low">
              {t('preview.logs.label')}
            </span>
            <button
              type="button"
              onClick={onViewFullLogs}
              className="flex items-center gap-half text-xs text-brand hover:text-brand-hover"
            >
              <span>{t('preview.logs.viewFull')}</span>
              <ArrowSquareOutIcon className="size-icon-xs" />
            </button>
          </div>

          {devServerProcesses.length > 1 && (
            <div className="flex border-b border-border mx-base">
              {devServerProcesses.map((process) => (
                <button
                  key={process.id}
                  className={cn(
                    'px-base py-half text-xs border-b-2 transition-colors',
                    activeProcessId === process.id
                      ? 'border-brand text-normal'
                      : 'border-transparent text-low hover:text-normal'
                  )}
                  onClick={() => onTabChange(process.id)}
                >
                  {getDevServerWorkingDir(process) ?? 'Dev Server'}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading && devServerProcesses.length === 0 ? (
              <div className="h-full flex items-center justify-center text-low">
                <SpinnerIcon className="size-icon-sm animate-spin" />
              </div>
            ) : devServerProcesses.length > 0 ? (
              <VirtualizedProcessLogs logs={logs} error={logsError} />
            ) : null}
          </div>
        </div>
      </CollapsibleSectionHeader>
    </div>
  );
}
