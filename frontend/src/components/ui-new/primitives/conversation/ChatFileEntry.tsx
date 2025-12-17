import { CaretDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ChatFileEntryProps {
  filename: string;
  additions?: number;
  deletions?: number;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function ChatFileEntry({
  filename,
  additions,
  deletions,
  expanded = false,
  onToggle,
  className,
}: ChatFileEntryProps) {
  const hasStats = additions !== undefined || deletions !== undefined;

  return (
    <div
      className={cn(
        'flex items-center bg-panel border rounded-sm p-base w-full',
        onToggle && 'cursor-pointer',
        className
      )}
      onClick={onToggle}
    >
      <div className="flex-1 flex items-center gap-base min-w-0">
        <span className="text-sm text-normal truncate">{filename}</span>
        {hasStats && (
          <span className="text-sm shrink-0">
            {additions !== undefined && additions > 0 && (
              <span className="text-success">+{additions}</span>
            )}
            {additions !== undefined && deletions !== undefined && ' '}
            {deletions !== undefined && deletions > 0 && (
              <span className="text-error">-{deletions}</span>
            )}
          </span>
        )}
      </div>
      {onToggle && (
        <CaretDown
          className={cn(
            'size-icon-xs shrink-0 text-low transition-transform',
            !expanded && '-rotate-90'
          )}
        />
      )}
    </div>
  );
}
