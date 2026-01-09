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
import {
  VirtualizedProcessLogs,
  type LogEntry,
} from '../VirtualizedProcessLogs';
import { PERSIST_KEYS } from '@/stores/useUiPreferencesStore';

interface PreviewControlsProps {
  logs: LogEntry[];
  url?: string;
  onViewFullLogs: () => void;
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
  logs,
  url,
  onViewFullLogs,
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
        {/* Controls row: URL bar + Start/Stop button */}
        <div className="flex items-center gap-half p-base">
          {url && (
            <div className="flex items-center gap-half bg-panel rounded-sm px-base py-half flex-1">
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

        {/* Logs section */}
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

          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading && logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-low">
                <SpinnerIcon className="size-icon-sm animate-spin" />
              </div>
            ) : (
              <VirtualizedProcessLogs logs={logs} error={null} />
            )}
          </div>
        </div>
      </CollapsibleSectionHeader>
    </div>
  );
}
