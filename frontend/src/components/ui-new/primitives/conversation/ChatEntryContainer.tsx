import { ComponentType } from 'react';
import {
  CaretDownIcon,
  UserIcon,
  ListChecksIcon,
  GearIcon,
  IconProps,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

type Variant = 'user' | 'plan' | 'system';

interface VariantConfig {
  icon: ComponentType<IconProps>;
  border: string;
  headerBg: string;
  bg: string;
}

const variantConfig: Record<Variant, VariantConfig> = {
  user: {
    icon: UserIcon,
    border: 'border-border',
    headerBg: '',
    bg: '',
  },
  plan: {
    icon: ListChecksIcon,
    border: 'border-border',
    headerBg: 'bg-secondary',
    bg: 'bg-panel',
  },
  system: {
    icon: GearIcon,
    border: 'border-border',
    headerBg: 'bg-gray-50 dark:bg-gray-900/30',
    bg: '',
  },
};

interface ChatEntryContainerProps {
  variant: Variant;
  title?: React.ReactNode;
  headerRight?: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function ChatEntryContainer({
  variant,
  title,
  headerRight,
  expanded = false,
  onToggle,
  children,
  actions,
  className,
}: ChatEntryContainerProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-sm w-full',
        config.border && 'border',
        config.border,
        config.bg,
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center px-double py-base gap-base rounded-sm overflow-hidden',
          config.headerBg,
          onToggle && 'cursor-pointer'
        )}
        onClick={onToggle}
      >
        <Icon className="size-icon-xs shrink-0 text-low" />
        {title && (
          <span className="flex-1 text-sm text-normal truncate">{title}</span>
        )}
        {headerRight}
        {onToggle && (
          <CaretDownIcon
            className={cn(
              'size-icon-xs shrink-0 text-low transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        )}
      </div>

      {/* Content - shown when expanded */}
      {expanded && children && (
        <div className="px-double py-double">{children}</div>
      )}

      {/* Actions footer - optional */}
      {actions && (
        <div className="flex items-center gap-base px-double py-base border-t">
          {actions}
        </div>
      )}
    </div>
  );
}
