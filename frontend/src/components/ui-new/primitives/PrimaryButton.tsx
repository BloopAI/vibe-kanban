import { cn } from '@/lib/utils';
import { SpinnerIcon, type Icon } from '@phosphor-icons/react';

interface PrimaryButtonProps {
  variant?: 'default' | 'secondary';
  actionIcon?: Icon | 'spinner';
  value?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function PrimaryButton({
  variant = 'default',
  actionIcon: ActionIcon,
  value,
  onClick,
  disabled,
}: PrimaryButtonProps) {
  return (
    <button
      className={cn(
        'rounded-sm px-base py-half text-cta h-cta flex gap-half items-center',
        variant === 'default' && 'bg-brand text-on-brand hover:bg-brand-hover',
        variant === 'secondary' &&
          'border-2 border-brand bg-brand-secondary text-on-brand',
        disabled && 'cursor-not-allowed bg-brand-secondary'
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {value}
      {ActionIcon ? (
        ActionIcon === 'spinner' ? (
          <SpinnerIcon className={'size-icon-sm animate-spin'} weight="bold" />
        ) : (
          <ActionIcon className={'size-icon-xs'} weight="bold" />
        )
      ) : null}
    </button>
  );
}
