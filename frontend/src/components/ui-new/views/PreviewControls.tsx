import { ArrowSquareOutIcon, SpinnerIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { VirtualizedProcessLogs } from '../containers/VirtualizedProcessLogs';
import { getDevServerWorkingDir } from '@/lib/devServerUtils';
import type { ExecutionProcess, PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface PreviewControlsProps {
  devServerProcesses: ExecutionProcess[];
  activeProcessId: string | null;
  logs: LogEntry[];
  logsError: string | null;
  onViewFullLogs: () => void;
  onTabChange: (processId: string) => void;
  isStarting: boolean;
  isServerRunning: boolean;
  className?: string;
}

export function PreviewControls({
  devServerProcesses,
  activeProcessId,
  logs,
  logsError,
  onViewFullLogs,
  onTabChange,
  isStarting,
  isServerRunning,
  className,
}: PreviewControlsProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const isLoading = isStarting || isServerRunning;

  return (
    <div
      className={cn(
        'w-full bg-secondary flex flex-col overflow-hidden',
        className
      )}
    >
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-base py-half">
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
                {getDevServerWorkingDir(process) ??
                  t('preview.browser.devServerFallback')}
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
            <VirtualizedProcessLogs
              logs={logs}
              error={logsError}
              searchQuery=""
              matchIndices={[]}
              currentMatchIndex={-1}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
