import { cn } from '@/lib/utils';

interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary';
  children: React.ReactNode;
}

export function PrimaryButton({
  variant = 'default',
  children,
  className,
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      className={cn(
        'rounded-sm px-base py-half text-base font-semibold leading-[14px]',
        variant === 'default' && 'bg-brand text-on-brand hover:bg-brand-hover',
        variant === 'secondary' &&
          'border-2 border-brand-secondary text-brand-secondary',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
