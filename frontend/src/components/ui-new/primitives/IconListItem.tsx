import { SpinnerIcon, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface IconListItemProps {
  icon: Icon;
  label: string;
  subLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function IconListItem({
  icon: IconComponent,
  label,
  subLabel,
  onClick,
  disabled,
  loading,
  className,
}: IconListItemProps) {
  const content = (
    <>
      {loading ? (
        <SpinnerIcon className="size-icon-sm text-low flex-shrink-0 animate-spin" />
      ) : (
        <IconComponent
          className="size-icon-base text-low flex-shrink-0"
          weight="regular"
        />
      )}
      <div className={cn('flex-1 min-w-0', !subLabel && 'flex items-center')}>
        <span className="text-sm text-normal truncate block">{label}</span>
        {subLabel && (
          <span className="text-xs text-low truncate block">{subLabel}</span>
        )}
      </div>
    </>
  );

  const baseClasses = cn(
    'flex items-center gap-base py-half px-base rounded-sm text-left',
    onClick && 'hover:bg-tertiary cursor-pointer',
    disabled && 'opacity-50 pointer-events-none',
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className={baseClasses}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClasses}>{content}</div>;
}
