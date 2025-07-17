import React from 'react';
import { cn } from '@/lib/utils';

interface DesktopInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  variant?: 'default' | 'search' | 'borderless';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const DesktopInput = React.forwardRef<HTMLInputElement, DesktopInputProps>(
  ({ className, label, error, variant = 'default', icon, iconPosition = 'left', ...props }, ref) => {
    const variantStyles = {
      default: 'border-slate-300/50 bg-white/60 backdrop-blur-sm focus:border-blue-500 focus:bg-white/80',
      search: 'border-slate-300/50 bg-slate-50/80 backdrop-blur-sm focus:border-blue-500 focus:bg-white/90 pl-10',
      borderless: 'border-transparent bg-slate-50/50 backdrop-blur-sm focus:border-blue-500 focus:bg-white/80'
    };
    
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'flex h-11 w-full rounded-xl border px-3 py-2 text-sm transition-all',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1',
              'placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50',
              'shadow-sm hover:shadow-md',
              variantStyles[variant],
              icon && iconPosition === 'left' && 'pl-10',
              icon && iconPosition === 'right' && 'pr-10',
              className
            )}
            {...props}
          />
          {icon && iconPosition === 'right' && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500">
              {icon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }
);

DesktopInput.displayName = 'DesktopInput';
