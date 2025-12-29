import { useState, useCallback, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Hexagon, Monitor, Server, Database, Cloud, Settings, FileCode, Palette, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

// Predefined component options
export const COMPONENT_OPTIONS: {
  value: string;
  label: string;
  icon: LucideIcon;
  shortcut: string;
  color: string;
}[] = [
  { value: 'frontend', label: 'Frontend', icon: Monitor, shortcut: '1', color: 'text-blue-500' },
  { value: 'backend', label: 'Backend', icon: Server, shortcut: '2', color: 'text-green-500' },
  { value: 'api', label: 'API', icon: Cloud, shortcut: '3', color: 'text-purple-500' },
  { value: 'database', label: 'Database', icon: Database, shortcut: '4', color: 'text-orange-500' },
  { value: 'devops', label: 'DevOps', icon: Settings, shortcut: '5', color: 'text-gray-500' },
  { value: 'design', label: 'Design', icon: Palette, shortcut: '6', color: 'text-pink-500' },
  { value: 'core', label: 'Core', icon: FileCode, shortcut: '7', color: 'text-yellow-500' },
];

export type ComponentValue = string | null;

interface ComponentSelectorProps {
  value: ComponentValue;
  onChange: (value: ComponentValue) => void;
  disabled?: boolean;
  variant?: 'button' | 'pill' | 'tag';
  size?: 'sm' | 'default';
  enableKeyboardShortcuts?: boolean;
}

export function ComponentSelector({
  value,
  onChange,
  disabled = false,
  variant = 'tag',
  size = 'sm',
  enableKeyboardShortcuts = true,
}: ComponentSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedComponent = COMPONENT_OPTIONS.find((c) => c.value === value);
  const ComponentIcon = selectedComponent?.icon || Hexagon;

  // Handle keyboard shortcuts when dropdown is open
  useEffect(() => {
    if (!open || !enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '7') {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        if (index < COMPONENT_OPTIONS.length) {
          onChange(COMPONENT_OPTIONS[index].value);
          setOpen(false);
        }
      }
      if (e.key === '0') {
        e.preventDefault();
        onChange(null);
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, enableKeyboardShortcuts, onChange]);

  const handleSelect = useCallback((newValue: ComponentValue) => {
    onChange(newValue);
    setOpen(false);
  }, [onChange]);

  const renderTrigger = () => {
    switch (variant) {
      case 'tag':
        return (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-auto py-0.5 px-2 gap-1 text-xs rounded-md',
              'bg-muted/50 border border-border/50 hover:bg-muted',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            disabled={disabled}
          >
            <ComponentIcon className={cn('h-3 w-3', selectedComponent?.color || 'text-muted-foreground')} />
            <span className="text-muted-foreground">
              {selectedComponent?.label || 'Add component'}
            </span>
          </Button>
        );
      case 'pill':
        return (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 gap-1 px-2 text-xs rounded-full',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            disabled={disabled}
          >
            <ComponentIcon className={cn('h-3.5 w-3.5', selectedComponent?.color || 'text-muted-foreground')} />
            {selectedComponent && <span>{selectedComponent.label}</span>}
          </Button>
        );
      default:
        return (
          <Button
            variant="outline"
            size={size}
            className={cn(
              'gap-2 px-3 text-xs font-medium rounded-md',
              'border-border/60 hover:bg-accent/50',
              size === 'sm' && 'h-8',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            disabled={disabled}
          >
            <ComponentIcon className={cn('h-3.5 w-3.5', selectedComponent?.color || 'text-muted-foreground')} />
            {selectedComponent?.label || 'Component'}
          </Button>
        );
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {renderTrigger()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {/* None option */}
        <DropdownMenuItem
          onClick={() => handleSelect(null)}
          className={cn('justify-between cursor-pointer', !value && 'bg-accent')}
        >
          <span className="flex items-center gap-2">
            <X className="h-4 w-4 text-muted-foreground" />
            No component
          </span>
          <span className="text-xs text-muted-foreground font-mono">0</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Component options */}
        {COMPONENT_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn('justify-between cursor-pointer', isSelected && 'bg-accent')}
            >
              <span className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4', option.color)} />
                {option.label}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{option.shortcut}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Hook to enable global L key shortcut to open component selector
export function useComponentKeyboardShortcut(
  onOpen: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on 'L' key when not in an input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (!isInput && e.key.toLowerCase() === 'l' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpen, enabled]);
}
