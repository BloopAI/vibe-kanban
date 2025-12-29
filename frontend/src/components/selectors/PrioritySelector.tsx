import { useState, useCallback, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Circle, AlertCircle, Signal, SignalMedium, SignalLow } from 'lucide-react';
import { cn } from '@/lib/utils';

// Priority levels matching Linear's design
export const PRIORITY_OPTIONS = [
  { value: 0, label: 'No priority', icon: Circle, shortcut: '0', color: 'text-muted-foreground' },
  { value: 1, label: 'Urgent', icon: AlertCircle, shortcut: '1', color: 'text-orange-500' },
  { value: 2, label: 'High', icon: Signal, shortcut: '2', color: 'text-orange-400' },
  { value: 3, label: 'Medium', icon: SignalMedium, shortcut: '3', color: 'text-yellow-500' },
  { value: 4, label: 'Low', icon: SignalLow, shortcut: '4', color: 'text-blue-400' },
] as const;

export type PriorityValue = typeof PRIORITY_OPTIONS[number]['value'];

interface PrioritySelectorProps {
  value: PriorityValue;
  onChange: (value: PriorityValue) => void;
  disabled?: boolean;
  variant?: 'button' | 'icon-only' | 'pill';
  size?: 'sm' | 'default';
  enableKeyboardShortcuts?: boolean;
}

export function PrioritySelector({
  value,
  onChange,
  disabled = false,
  variant = 'button',
  size = 'sm',
  enableKeyboardShortcuts = true,
}: PrioritySelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedPriority = PRIORITY_OPTIONS.find((p) => p.value === value) || PRIORITY_OPTIONS[0];
  const PriorityIcon = selectedPriority.icon;

  // Handle keyboard shortcuts when dropdown is open
  useEffect(() => {
    if (!open || !enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '4') {
        e.preventDefault();
        const newValue = parseInt(e.key, 10) as PriorityValue;
        onChange(newValue);
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, enableKeyboardShortcuts, onChange]);

  const handleSelect = useCallback((newValue: PriorityValue) => {
    onChange(newValue);
    setOpen(false);
  }, [onChange]);

  const renderTrigger = () => {
    switch (variant) {
      case 'icon-only':
        return (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6 p-0',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            disabled={disabled}
          >
            <PriorityIcon className={cn('h-4 w-4', selectedPriority.color)} />
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
            <PriorityIcon className={cn('h-3.5 w-3.5', selectedPriority.color)} />
            {value !== 0 && <span className={selectedPriority.color}>{selectedPriority.label}</span>}
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
            <PriorityIcon className={cn('h-3.5 w-3.5', selectedPriority.color)} />
            {selectedPriority.label !== 'No priority' ? selectedPriority.label : 'Priority'}
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
        {PRIORITY_OPTIONS.map((option) => {
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

// Hook to enable global P key shortcut to open priority selector
export function usePriorityKeyboardShortcut(
  onOpen: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on 'P' key when not in an input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (!isInput && e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpen, enabled]);
}
