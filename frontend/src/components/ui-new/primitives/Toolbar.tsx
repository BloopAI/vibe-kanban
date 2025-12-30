import {
  type Icon,
  SortAscendingIcon,
  SortDescendingIcon,
  CalendarIcon,
  UserIcon,
  TagIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTriggerButton,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from './Dropdown';

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

interface ToolbarDropdownProps {
  label: string;
  icon?: Icon;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

function ToolbarDropdown({
  label,
  icon,
  children,
  className,
  disabled,
}: ToolbarDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTriggerButton
        icon={icon}
        label={label}
        className={className}
        disabled={disabled}
      />
      <DropdownMenuContent>
        {children ?? (
          <>
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuItem icon={SortAscendingIcon}>
              Ascending
            </DropdownMenuItem>
            <DropdownMenuItem icon={SortDescendingIcon}>
              Descending
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Group by</DropdownMenuLabel>
            <DropdownMenuItem icon={CalendarIcon}>Date</DropdownMenuItem>
            <DropdownMenuItem icon={UserIcon}>Assignee</DropdownMenuItem>
            <DropdownMenuItem icon={TagIcon}>Label</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { Toolbar, ToolbarIconButton, ToolbarDropdown };
