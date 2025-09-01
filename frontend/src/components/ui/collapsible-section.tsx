import { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  badge?: number;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  icon,
  badge,
  actions,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 text-sm font-medium hover:text-foreground/80 transition-colors"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
          {icon}
          <span className="flex items-center gap-2">
            {title}
            {badge !== undefined && badge > 0 && (
              <span className="w-5 h-5 text-xs bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                {badge}
              </span>
            )}
          </span>
        </button>
        {actions}
      </div>
      {isOpen && <div className="space-y-4 pl-7">{children}</div>}
    </div>
  );
}
