import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Project } from 'shared/types';

interface SearchBarProps {
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  onClear?: () => void;
  project: Project | null;
}

export function SearchBar({
  className,
  value = '',
  onChange,
  disabled = false,
  onClear,
  project,
}: SearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        inputRef.current?.focus();
      }

      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        e.preventDefault();
        onClear?.();
        inputRef.current?.blur();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClear]);

  if (disabled) {
    return null;
  }

  return (
    <div className={cn('relative w-64 sm:w-72', className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={project ? `Search ${project.name}...` : 'Search...'}
        className="pl-8 pr-14 h-8 bg-muted"
      />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none select-none font-mono text-[10px] text-muted-foreground rounded border bg-muted px-1 py-0.5">
        ⌘S
      </kbd>
    </div>
  );
}
