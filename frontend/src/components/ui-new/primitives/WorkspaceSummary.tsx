import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';

function RunningDots() {
  return (
    <div className="flex items-center gap-[2px] shrink-0">
      <span className="size-1.5 rounded-full bg-brand animate-running-dot-1" />
      <span className="size-1.5 rounded-full bg-brand animate-running-dot-2" />
      <span className="size-1.5 rounded-full bg-brand animate-running-dot-3" />
    </div>
  );
}

interface WorkspaceSummaryProps {
  name: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isActive?: boolean;
  isRunning?: boolean;
  isPinned?: boolean;
  onClick?: () => void;
  className?: string;
}

export function WorkspaceSummary({
  name,
  filesChanged,
  linesAdded,
  linesRemoved,
  isActive = false,
  isRunning = false,
  isPinned = false,
  onClick,
  className,
}: WorkspaceSummaryProps) {
  const hasStats = filesChanged !== undefined;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full cursor-pointer flex-col border-l-4 py-base text-left',
        isActive ? 'border-normal pl-double' : 'border-none',
        className
      )}
    >
      <div
        className={cn(
          'truncate text-base font-medium group-hover:text-high',
          isActive ? 'text-high' : 'text-normal'
        )}
      >
        {name}
      </div>
      {hasStats && (
        <div className="flex w-full items-center gap-half text-sm">
          {isRunning && <RunningDots />}
          {isPinned && <Pin className="size-3 text-brand shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-low">
            {filesChanged} {filesChanged === 1 ? 'File' : 'Files'} changed
          </span>
          <span className="shrink-0 text-right space-x-half">
            {linesAdded !== undefined && (
              <span className="text-success">+{linesAdded}</span>
            )}
            {linesRemoved !== undefined && (
              <>
                {linesAdded !== undefined && ' '}
                <span className="text-error">-{linesRemoved}</span>
              </>
            )}
          </span>
        </div>
      )}
    </button>
  );
}
