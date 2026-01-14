import { cn } from '@/lib/utils';
import type { Icon } from '@phosphor-icons/react';
import { Tooltip } from './Tooltip';

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
  iconClassName?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  'aria-label': string;
  title?: string;
  className?: string;
}

export function IconButtonGroupItem({
  icon: IconComponent,
  iconClassName,
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

  const button = (
    <button
      type="button"
      className={cn('p-half transition-colors', stateStyles, className)}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <IconComponent
        className={cn('size-icon-sm', iconClassName)}
        weight="bold"
      />
    </button>
  );

  return title ? <Tooltip content={title}>{button}</Tooltip> : button;
}
