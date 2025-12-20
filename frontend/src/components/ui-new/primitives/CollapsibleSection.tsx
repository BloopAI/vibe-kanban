import { useState } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  expanded?: boolean;
  onToggle?: () => void;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  expanded: controlledExpanded,
  onToggle,
  defaultExpanded = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    }
    if (!isControlled) {
      setInternalExpanded((prev) => !prev);
    }
  };

  return (
    <div className={cn('flex flex-col gap-double', className)}>
      <button
        type="button"
        onClick={handleToggle}
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
