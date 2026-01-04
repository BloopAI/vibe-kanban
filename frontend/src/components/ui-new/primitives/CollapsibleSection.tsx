import { CaretDownIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  usePersistedExpanded,
  type PersistKey,
} from '@/stores/useUiPreferencesStore';

interface CollapsibleSectionProps {
  persistKey: PersistKey;
  title: string;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function CollapsibleSection({
  persistKey,
  title,
  defaultExpanded = true,
  children,
  className,
  contentClassName,
}: CollapsibleSectionProps) {
  const [expanded, toggle] = usePersistedExpanded(persistKey, defaultExpanded);

  return (
    <div className={cn('flex flex-col', className)}>
      <button
        type="button"
        onClick={() => toggle()}
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
      {expanded && <div className={contentClassName}>{children}</div>}
    </div>
  );
}
