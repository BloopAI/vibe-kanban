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

export const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  ({ className, value = '', onChange, disabled = false, project }, ref) => {
    if (disabled) {
      return null;
    }

    return (
      <div className={cn('relative w-64 sm:w-72', className)}>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={ref}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          placeholder={project ? `Search ${project.name}...` : 'Search...'}
          className="pl-8 pr-14 h-8 bg-muted"
        />
      </div>
    );
  }
);

SearchBar.displayName = 'SearchBar';
