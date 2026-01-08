import {
  type Icon,
  SortAscendingIcon,
  SortDescendingIcon,
  CalendarIcon,
  UserIcon,
  TagIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');

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
            <DropdownMenuLabel>{t('toolbar.sortBy')}</DropdownMenuLabel>
            <DropdownMenuItem icon={SortAscendingIcon}>
              {t('sorting.ascending')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={SortDescendingIcon}>
              {t('sorting.descending')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('toolbar.groupBy')}</DropdownMenuLabel>
            <DropdownMenuItem icon={CalendarIcon}>
              {t('grouping.date')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={UserIcon}>
              {t('grouping.assignee')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={TagIcon}>
              {t('grouping.label')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { Toolbar, ToolbarIconButton, ToolbarDropdown };
