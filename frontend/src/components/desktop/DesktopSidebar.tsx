import React from 'react';
import { cn } from '@/lib/utils';
import { DesktopCard } from './DesktopCard';

interface DesktopSidebarProps {
  children: React.ReactNode;
  className?: string;
  width?: 'default' | 'wide' | 'narrow';
}

interface DesktopSidebarItemProps {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
  children?: React.ReactNode;
}

interface DesktopSidebarSectionProps {
  title?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ 
  children, 
  className,
  width = 'default'
}) => {
  const widthStyles = {
    narrow: 'w-48',
    default: 'w-64',
    wide: 'w-80'
  };
  
  return (
    <div className={cn(
      'flex flex-col h-full',
      widthStyles[width],
      className
    )}>
      <DesktopCard variant="transparent" padding="sm" className="h-full">
        <div className="space-y-1">
          {children}
        </div>
      </DesktopCard>
    </div>
  );
};

export const DesktopSidebarItem: React.FC<DesktopSidebarItemProps> = ({
  icon,
  label,
  active = false,
  onClick,
  badge,
  children
}) => {
  return (
    <div>
      <button
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200',
          active 
            ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25 scale-[1.02]'
            : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 hover:scale-[1.01]',
          'group'
        )}
      >
        {icon && (
          <div className={cn(
            'flex-shrink-0 w-5 h-5 transition-colors',
            active ? 'text-white' : 'text-slate-500 group-hover:text-slate-700'
          )}>
            {icon}
          </div>
        )}
        <span className="flex-1 text-left truncate">{label}</span>
        {badge && (
          <span className={cn(
            'flex-shrink-0 px-2 py-1 text-xs font-semibold rounded-full',
            active 
              ? 'bg-white/20 text-white'
              : 'bg-slate-200 text-slate-700 group-hover:bg-slate-300'
          )}>
            {badge}
          </span>
        )}
      </button>
      {children && (
        <div className="ml-8 mt-1 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
};

export const DesktopSidebarSection: React.FC<DesktopSidebarSectionProps> = ({
  title,
  children,
  collapsible = false,
  defaultCollapsed = false
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  
  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between px-3 py-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {title}
          </h3>
          {collapsible && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg 
                className={cn('w-4 h-4 transition-transform', isCollapsed && 'rotate-180')} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      )}
      {!isCollapsed && (
        <div className="space-y-1">
          {children}
        </div>
      )}
    </div>
  );
};
