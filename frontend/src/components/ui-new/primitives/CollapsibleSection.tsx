import { CaretDownIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
  className,
}: CollapsibleSectionProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full cursor-pointer"
      >
        <span className="font-medium truncate text-normal">{title}</span>
        <CaretDownIcon
          weight="fill"
          className={cn(
            'size-icon-xs text-low transition-transform',
            !expanded && '-rotate-90'
          )}
        />
      </button>
      {expanded && children}
    </div>
  );
}
