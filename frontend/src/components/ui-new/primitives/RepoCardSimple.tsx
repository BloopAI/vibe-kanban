import { FolderSimpleIcon, XIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface RepoCardSimpleProps {
  name: string;
  path: string;
  onRemove?: () => void;
  className?: string;
}

export function RepoCardSimple({
  name,
  path,
  onRemove,
  className,
}: RepoCardSimpleProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-base p-base bg-tertiary rounded-sm',
        className
      )}
    >
      <FolderSimpleIcon
        className="size-icon-base text-low flex-shrink-0 mt-0.5"
        weight="fill"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-normal truncate">{name}</p>
        <p className="text-xs text-low truncate">{path}</p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-low hover:text-normal flex-shrink-0"
        >
          <XIcon className="size-icon-xs" weight="bold" />
        </button>
      )}
    </div>
  );
}
