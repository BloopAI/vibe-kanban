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
  const variantStyles = disabled
    ? 'cursor-not-allowed bg-panel'
    : variant === 'default'
      ? 'bg-brand hover:bg-brand-hover text-on-brand'
      : 'bg-brand-secondary hover:bg-brand-hover text-on-brand';

  return (
    <button
      className={cn(
        'rounded-sm px-base py-half text-cta h-cta flex gap-half items-center',
        variantStyles
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
