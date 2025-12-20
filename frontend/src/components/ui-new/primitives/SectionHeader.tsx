import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  icon?: Icon;
  onIconClick?: () => void;
  className?: string;
}

export function SectionHeader({
  title,
  icon: IconComponent,
  onIconClick,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between w-full', className)}>
      <span className="font-medium truncate text-normal">{title}</span>
      {IconComponent && onIconClick && (
        <button
          type="button"
          onClick={onIconClick}
          className="text-low hover:text-normal"
        >
          <IconComponent className="size-icon-xs" weight="bold" />
        </button>
      )}
    </div>
  );
}
