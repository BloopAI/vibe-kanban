import { cn } from '@/lib/utils';
import type { Icon } from '@phosphor-icons/react';

interface IconButtonGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function IconButtonGroup({ children, className }: IconButtonGroupProps) {
  return (
    <div
      className={cn(
        'flex items-center rounded-sm border border-border overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

interface IconButtonGroupItemProps {
  icon: Icon;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  'aria-label': string;
  title?: string;
  className?: string;
}

export function IconButtonGroupItem({
  icon: IconComponent,
  onClick,
  disabled,
  active,
  'aria-label': ariaLabel,
  title,
  className,
}: IconButtonGroupItemProps) {
  const stateStyles = disabled
    ? 'opacity-40 cursor-not-allowed'
    : active
      ? 'bg-secondary text-normal'
      : 'text-low hover:text-normal hover:bg-secondary/50';

  return (
    <button
      type="button"
      className={cn('p-half transition-colors', stateStyles, className)}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <IconComponent className="size-icon-sm" weight="bold" />
    </button>
  );
}
