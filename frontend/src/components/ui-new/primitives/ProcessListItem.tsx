import {
  TerminalIcon,
  GearIcon,
  CodeIcon,
  GlobeIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { RunningDots } from './RunningDots';
import type {
  ExecutionProcessStatus,
  ExecutionProcessRunReason,
} from 'shared/types';

interface ProcessListItemProps {
  runReason: ExecutionProcessRunReason;
  status: ExecutionProcessStatus;
  startedAt: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

const RUN_REASON_LABELS: Record<ExecutionProcessRunReason, string> = {
  codingagent: 'Coding Agent',
  setupscript: 'Setup Script',
  cleanupscript: 'Cleanup Script',
  archivescript: 'Archive Script',
  devserver: 'Dev Server',
};

const RUN_REASON_ICONS: Record<ExecutionProcessRunReason, typeof TerminalIcon> =
  {
    codingagent: CodeIcon,
    setupscript: GearIcon,
    cleanupscript: GearIcon,
    archivescript: GearIcon,
    devserver: GlobeIcon,
  };

const STATUS_COLORS: Record<ExecutionProcessStatus, string> = {
  running: 'bg-info',
  completed: 'bg-success',
  failed: 'bg-destructive',
  killed: 'bg-low',
};

export function ProcessListItem({
  runReason,
  status,
  startedAt,
  selected,
  onClick,
  className,
}: ProcessListItemProps) {
  const IconComponent = RUN_REASON_ICONS[runReason];
  const label = RUN_REASON_LABELS[runReason];
  const statusColor = STATUS_COLORS[status];

  const isRunning = status === 'running';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full h-[26px] flex items-center gap-half px-half rounded-sm text-left transition-colors',
        className
      )}
    >
      <IconComponent
        className="size-icon-sm flex-shrink-0 text-low"
        weight="regular"
      />
      {isRunning ? (
        <RunningDots />
      ) : (
        <span
          className={cn('size-dot rounded-full flex-shrink-0', statusColor)}
          title={status}
        />
      )}
      <span
        className={cn(
          'text-sm truncate flex-1',
          selected ? 'text-high' : 'text-normal'
        )}
      >
        {label}
      </span>
      <span className="text-xs text-low flex-shrink-0">
        {formatRelativeTime(startedAt)}
      </span>
    </button>
  );
}
