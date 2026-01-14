import {
  type Icon,
  DownloadSimpleIcon,
  CopyIcon,
  ChartBarIcon,
  TagIcon,
  UploadSimpleIcon,
  ArchiveIcon,
  CaretDownIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './Dropdown';

interface ActionPanelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Container for bulk action buttons in the toolbar
 */
export function ActionPanel({ children, className }: ActionPanelProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>{children}</div>
  );
}

interface ActionPanelButtonProps {
  icon: Icon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Individual action button for the panel
 */
export function ActionPanelButton({
  icon: IconComponent,
  label,
  onClick,
  disabled,
  className,
}: ActionPanelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-sm',
        'text-xs text-low',
        'hover:text-normal hover:bg-secondary/60',
        'transition-colors duration-100',
        disabled &&
          'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-low',
        className
      )}
    >
      <IconComponent className="size-3.5" />
      <span>{label}</span>
    </button>
  );
}

interface ActionPanelMenuItem {
  icon: Icon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface ActionPanelDropdownProps {
  label: string;
  icon?: Icon;
  items: (ActionPanelMenuItem | 'separator')[];
  disabled?: boolean;
  className?: string;
}

/**
 * Dropdown menu for grouping multiple actions
 */
export function ActionPanelDropdown({
  label,
  icon: IconComponent,
  items,
  disabled,
  className,
}: ActionPanelDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-sm',
            'text-xs text-low',
            'hover:text-normal hover:bg-secondary/60',
            'transition-colors duration-100',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
        >
          {IconComponent && <IconComponent className="size-3.5" />}
          <span>{label}</span>
          <CaretDownIcon className="size-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((item, index) =>
          item === 'separator' ? (
            <DropdownMenuSeparator key={`sep-${index}`} />
          ) : (
            <DropdownMenuItem
              key={item.label}
              icon={item.icon}
              onClick={item.onClick}
              disabled={item.disabled}
              className={item.destructive ? 'text-destructive' : undefined}
            >
              {item.label}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Pre-configured action icons for convenience
export const ActionIcons = {
  Import: DownloadSimpleIcon,
  Export: UploadSimpleIcon,
  Deduplicate: CopyIcon,
  Prioritize: ChartBarIcon,
  BulkTag: TagIcon,
  Archive: ArchiveIcon,
} as const;
