import { SpinnerIcon, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface IconListItemProps {
  icon: Icon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function IconListItem({
  icon: IconComponent,
  label,
  onClick,
  disabled,
  loading,
  className,
}: IconListItemProps) {
  const content = (
    <div className="text-normal hover:text-high flex items-center gap-base">
      {loading ? (
        <SpinnerIcon className="size-icon-sm flex-shrink-0 animate-spin" />
      ) : (
        <IconComponent
          className="size-icon-base flex-shrink-0"
          weight="regular"
        />
      )}
      <span className="text-sm truncate block">{label}</span>
    </div>
  );

  const baseClasses = cn(
    'flex items-center gap-base rounded-sm text-left',
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
