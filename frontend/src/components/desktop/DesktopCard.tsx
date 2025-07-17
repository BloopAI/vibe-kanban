import React from 'react';
import { cn } from '@/lib/utils';

interface DesktopCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'outlined' | 'transparent';
  padding?: 'default' | 'sm' | 'lg' | 'none';
  interactive?: boolean;
}

export const DesktopCard: React.FC<DesktopCardProps> = ({ 
  children, 
  className,
  variant = 'default',
  padding = 'default',
  interactive = false
}) => {
  const variantStyles = {
    default: 'bg-white/80 backdrop-blur-sm border border-slate-200/50 shadow-sm',
    elevated: 'bg-white/90 backdrop-blur-md border border-slate-200/50 shadow-lg shadow-slate-200/50',
    outlined: 'bg-white/60 backdrop-blur-sm border-2 border-slate-300/50 shadow-sm',
    transparent: 'bg-white/40 backdrop-blur-sm border border-slate-200/30'
  };
  
  const paddingStyles = {
    none: '',
    sm: 'p-4',
    default: 'p-6',
    lg: 'p-8'
  };
  
  const interactiveStyles = interactive 
    ? 'transition-all duration-200 hover:shadow-lg hover:shadow-slate-200/50 hover:scale-[1.02] hover:border-slate-300/60 cursor-pointer'
    : '';
  
  return (
    <div className={cn(
      'rounded-2xl transition-all duration-200',
      variantStyles[variant],
      paddingStyles[padding],
      interactiveStyles,
      className
    )}>
      {children}
    </div>
  );
};
