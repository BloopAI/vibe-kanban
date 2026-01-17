import type { Icon } from '@phosphor-icons/react';
import { CaretDownIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  usePersistedExpanded,
  type PersistKey,
} from '@/stores/useUiPreferencesStore';

export type SectionAction = {
  icon: Icon;
  onClick: () => void;
};

interface CollapsibleSectionHeaderProps {
  persistKey: PersistKey;
  title: string;
  defaultExpanded?: boolean;
  actions: SectionAction[];
  children?: React.ReactNode;
  className?: string;
}

export function CollapsibleSectionHeader({
  persistKey,
  title,
  defaultExpanded = true,
  actions,
  children,
  className,
}: CollapsibleSectionHeaderProps) {
  const [expanded, toggle] = usePersistedExpanded(persistKey, defaultExpanded);

  const handleActionClick = (e: React.MouseEvent, onClick: () => void) => {
    e.stopPropagation();
    onClick();
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
            {actions.map((action, index) => (
              <span
                key={index}
                role="button"
                tabIndex={0}
                onClick={(e) => handleActionClick(e, action.onClick)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleActionClick(
                      e as unknown as React.MouseEvent,
                      action.onClick
                    );
                  }
                }}
                className="text-low hover:text-normal"
              >
                <action.icon className="size-icon-xs" weight="bold" />
              </span>
            ))}
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
