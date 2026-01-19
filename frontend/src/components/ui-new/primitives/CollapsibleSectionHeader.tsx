import type { Icon } from '@phosphor-icons/react';
import { CaretDownIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  usePersistedExpanded,
  type PersistKey,
} from '@/stores/useUiPreferencesStore';

export type HeaderActionIcon = {
  icon: Icon;
  onClick: () => void;
  isActive?: boolean;
};

interface CollapsibleSectionHeaderProps {
  persistKey?: PersistKey;
  title: string;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  icon?: Icon;
  onIconClick?: () => void;
  actionIcons?: HeaderActionIcon[];
  children?: React.ReactNode;
  className?: string;
}

export function CollapsibleSectionHeader({
  persistKey,
  title,
  defaultExpanded = true,
  collapsible = true,
  icon: IconComponent,
  onIconClick,
  actionIcons,
  children,
  className,
}: CollapsibleSectionHeaderProps) {
  const [expanded, toggle] = usePersistedExpanded(
    persistKey ?? ('unused-key' as PersistKey),
    defaultExpanded
  );

  const handleIconClick = (e: React.MouseEvent, callback?: () => void) => {
    e.stopPropagation();
    callback?.();
  };

  const isExpanded = collapsible ? expanded : true;

  const headerContent = (
    <>
      <span className="font-medium truncate text-normal">{title}</span>
      <div className="flex items-center gap-half">
        {actionIcons?.map((action, index) => {
          const ActionIcon = action.icon;
          return (
            <span
              key={index}
              role="button"
              tabIndex={0}
              onClick={(e) => handleIconClick(e, action.onClick)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleIconClick(
                    e as unknown as React.MouseEvent,
                    action.onClick
                  );
                }
              }}
              className={cn(
                'hover:text-normal',
                action.isActive ? 'text-brand' : 'text-low'
              )}
            >
              <ActionIcon className="size-icon-xs" weight="bold" />
            </span>
          );
        })}
        {IconComponent && onIconClick && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => handleIconClick(e, onIconClick)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleIconClick(e as unknown as React.MouseEvent, onIconClick);
              }
            }}
            className="text-low hover:text-normal"
          >
            <IconComponent className="size-icon-xs" weight="bold" />
          </span>
        )}
        {collapsible && (
          <CaretDownIcon
            weight="fill"
            className={cn(
              'size-icon-xs text-low transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        )}
      </div>
    </>
  );

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      <div className="">
        {collapsible ? (
          <button
            type="button"
            onClick={() => toggle()}
            className={cn(
              'flex items-center justify-between w-full px-base py-half cursor-pointer'
            )}
          >
            {headerContent}
          </button>
        ) : (
          <div
            className={cn(
              'flex items-center justify-between w-full px-base py-half'
            )}
          >
            {headerContent}
          </div>
        )}
      </div>
      {isExpanded && children}
    </div>
  );
}
