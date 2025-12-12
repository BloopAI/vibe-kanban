import { CaretRight, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

function Toolbar({ children, className, ...props }: ToolbarProps) {
  return (
    <div className={cn('flex items-center gap-base', className)} {...props}>
      {children}
    </div>
  );
}

interface ToolbarIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
}

function ToolbarIconButton({
  icon: IconComponent,
  className,
  ...props
}: ToolbarIconButtonProps) {
  return (
    <button
      className={cn(
        'flex items-center justify-center text-low hover:text-normal',
        className
      )}
      {...props}
    >
      <IconComponent className="size-icon-base" />
    </button>
  );
}

interface ToolbarDropdownProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

function ToolbarDropdown({ label, className, ...props }: ToolbarDropdownProps) {
  return (
    <button
      className={cn(
        'flex items-center gap-px rounded-sm bg-panel px-half py-half',
        className
      )}
      {...props}
    >
      <span className="text-sm text-low">{label}</span>
      <CaretRight className="size-icon-xs text-low" weight="bold" />
    </button>
  );
}

export { Toolbar, ToolbarIconButton, ToolbarDropdown };
