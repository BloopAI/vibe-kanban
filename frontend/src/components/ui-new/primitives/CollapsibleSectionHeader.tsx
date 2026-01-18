import type { Icon } from '@phosphor-icons/react';
import { CaretDownIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  usePersistedExpanded,
  type PersistKey,
} from '@/stores/useUiPreferencesStore';

interface CollapsibleSectionHeaderProps {
  persistKey: PersistKey;
  title: string;
  defaultExpanded?: boolean;
  icon?: Icon;
  onIconClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function CollapsibleSectionHeader({
  persistKey,
  title,
  defaultExpanded = true,
  icon: IconComponent,
  onIconClick,
  children,
  className,
}: CollapsibleSectionHeaderProps) {
  const [expanded, toggle] = usePersistedExpanded(persistKey, defaultExpanded);

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onIconClick?.();
  };

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      <div className="">
        <button
          type="button"
          onClick={() => toggle()}
          className={cn(
            'flex items-center justify-between w-full px-base py-half cursor-pointer'
          )}
        >
          <span className="font-medium truncate text-normal">{title}</span>
          <div className="flex items-center gap-half">
            {IconComponent && onIconClick && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleIconClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleIconClick(e as unknown as React.MouseEvent);
                  }
                }}
                className="text-low hover:text-normal"
              >
                <IconComponent className="size-icon-xs" weight="bold" />
              </span>
            )}
            <CaretDownIcon
              weight="fill"
              className={cn(
                'size-icon-xs text-low transition-transform',
                !expanded && '-rotate-90'
              )}
            />
          </div>
        </button>
      </div>
      {expanded && children}
    </div>
  );
}
