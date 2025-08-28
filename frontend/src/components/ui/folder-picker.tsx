import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  ChevronUp,
  File,
  Folder,
  FolderOpen,
  Home,
  Search,
} from 'lucide-react';
import { fileSystemApi } from '@/lib/api';
import { DirectoryEntry, DirectoryListResponse } from 'shared/types';

interface FolderPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  value?: string;
  title?: string;
  description?: string;
}

export function FolderPicker({
  open,
  onClose,
  onSelect,
  value = '',
  title = 'Select Folder',
  description = 'Choose a folder for your project',
}: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualPath, setManualPath] = useState(value);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    return entries.filter((entry) =>
      entry.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [entries, searchTerm]);

  useEffect(() => {
    if (open) {
      setManualPath(value);
      loadDirectory();
    }
  }, [open, value]);

  const loadDirectory = async (path?: string) => {
    setLoading(true);
    setError('');

    try {
      const result: DirectoryListResponse = await fileSystemApi.list(path);

      // Ensure result exists and has the expected structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response from file system API');
      }
      // Safely access entries, ensuring it's an array
      const entries = Array.isArray(result.entries) ? result.entries : [];
      setEntries(entries);
      const newPath = result.current_path || '';
      setCurrentPath(newPath);
      // Update manual path if we have a specific path (not for initial home directory load)
      if (path) {
        setManualPath(newPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      // Reset entries to empty array on error
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (entry: DirectoryEntry) => {
    if (entry.is_directory) {
      loadDirectory(entry.path);
      setManualPath(entry.path); // Auto-populate the manual path field
    }
  };

  const handleParentDirectory = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    const newPath = parentPath || '/';
    loadDirectory(newPath);
    setManualPath(newPath);
  };

  const handleHomeDirectory = () => {
    loadDirectory();
    // Don't set manual path here since home directory path varies by system
  };

  const handleManualPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualPath(e.target.value);
  };

  const handleManualPathSubmit = () => {
    loadDirectory(manualPath);
  };

  const handleSelectCurrent = () => {
    onSelect(manualPath || currentPath);
    onClose();
  };

  const handleSelectManual = () => {
    onSelect(manualPath);
    onClose();
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[600px] w-full h-[700px] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
          {/* Legend */}
          <div className="text-xs text-muted-foreground border-b pb-2">
            Click folder names to navigate • Use action buttons to select
          </div>

          {/* Manual path input */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Enter path manually:</div>
            <div className="flex space-x-2 min-w-0">
              <Input
                value={manualPath}
                onChange={handleManualPathChange}
                placeholder="/path/to/your/project"
                className="flex-1 min-w-0"
              />
              <Button
                onClick={handleManualPathSubmit}
                variant="outline"
                size="sm"
                className="flex-shrink-0"
              >
                Go
              </Button>
            </div>
          </div>

          {/* Search input */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Search current directory:</div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter folders and files..."
                className="pl-10"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center space-x-2 min-w-0">
            <Button
              onClick={handleHomeDirectory}
              variant="outline"
              size="sm"
              className="flex-shrink-0"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleParentDirectory}
              variant="outline"
              size="sm"
              disabled={!currentPath || currentPath === '/'}
              className="flex-shrink-0"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <div className="text-sm text-muted-foreground flex-1 truncate min-w-0">
              {currentPath || 'Home'}
            </div>
            <Button
              onClick={handleSelectCurrent}
              variant="outline"
              size="sm"
              disabled={!currentPath}
              className="flex-shrink-0"
            >
              Select Current
            </Button>
          </div>

          {/* Directory listing */}
          <div className="flex-1 border rounded-md overflow-auto">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading...
              </div>
            ) : error ? (
              <Alert variant="destructive" className="m-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : filteredEntries.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {searchTerm.trim() ? 'No matches found' : 'No folders found'}
              </div>
            ) : (
              <div className="p-2">
                {filteredEntries.map((entry, index) => (
                  <div
                    key={index}
                    className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-accent ${
                      !entry.is_directory ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    onClick={() =>
                      entry.is_directory && handleFolderClick(entry)
                    }
                    title={entry.name} // Show full name on hover
                  >
                    {entry.is_directory ? (
                      entry.is_git_repo ? (
                        <FolderOpen className="h-4 w-4 text-success flex-shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      )
                    ) : (
                      <File className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-sm flex-1 truncate min-w-0">
                      {entry.name}
                    </span>
                    {entry.is_git_repo && (
                      <span className="text-xs text-success bg-green-100 px-2 py-1 rounded flex-shrink-0">
                        git repo
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSelectManual} disabled={!manualPath.trim()}>
            Select Path
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
