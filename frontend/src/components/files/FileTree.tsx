import { useMemo } from 'react';
import { Loader2, AlertCircle, FolderOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileTreeItem } from './FileTreeItem';
import { FileBreadcrumb } from './FileBreadcrumb';
import { cn } from '@/lib/utils';
import type { DirectoryEntry, DirectoryListResponse } from 'shared/types';

interface FileTreeProps {
  data: DirectoryListResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  currentPath: string | null;
  selectedFile: string | null;
  filterTerm: string;
  onFilterChange: (term: string) => void;
  onNavigate: (path: string | null) => void;
  onSelectFile: (filePath: string) => void;
  className?: string;
}

/**
 * File tree component displaying directory contents
 * Mobile-first with drill-down navigation
 */
export function FileTree({
  data,
  isLoading,
  error,
  currentPath,
  selectedFile,
  filterTerm,
  onFilterChange,
  onNavigate,
  onSelectFile,
  className,
}: FileTreeProps) {
  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    if (!data?.entries) return [];

    let entries = [...data.entries];

    // Apply filter
    if (filterTerm.trim()) {
      const lower = filterTerm.toLowerCase();
      entries = entries.filter((e) => e.name.toLowerCase().includes(lower));
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.is_directory && !b.is_directory) return -1;
      if (!a.is_directory && b.is_directory) return 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }, [data?.entries, filterTerm]);

  const handleEntrySelect = (entry: DirectoryEntry) => {
    if (entry.is_directory) {
      // Navigate into directory
      onNavigate(entry.path);
    } else {
      // Select file for viewing
      onSelectFile(entry.path);
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Breadcrumb navigation */}
      <div className="flex-shrink-0 border-b px-2 py-2">
        <FileBreadcrumb currentPath={currentPath} onNavigate={onNavigate} />
      </div>

      {/* Filter input */}
      <div className="flex-shrink-0 p-2 border-b">
        <Input
          type="text"
          placeholder="Filter files..."
          value={filterTerm}
          onChange={(e) => onFilterChange(e.target.value)}
          className="h-9"
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Alert variant="destructive" className="m-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error.message || 'Failed to load directory'}
            </AlertDescription>
          </Alert>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">
              {filterTerm.trim() ? 'No matches found' : 'Empty directory'}
            </p>
          </div>
        ) : (
          <div className="p-1">
            {filteredEntries.map((entry) => (
              <FileTreeItem
                key={entry.path}
                entry={entry}
                isSelected={!entry.is_directory && entry.path === selectedFile}
                onSelect={handleEntrySelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FileTree;
