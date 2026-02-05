import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  Home,
  Music,
  Search,
} from 'lucide-react';
import { fileSystemApi } from '@/lib/api';
import { DirectoryEntry, DirectoryListResponse } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

// Supported audio file extensions
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac', '.wma'];

function isAudioFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export interface AudioFilePickerDialogProps {
  value?: string;
  title?: string;
  description?: string;
}

const AudioFilePickerDialogImpl = NiceModal.create<AudioFilePickerDialogProps>(
  ({
    value = '',
    title = 'Select Audio File',
    description = 'Choose an audio file (wav, mp3, ogg, m4a, aac, flac, wma)',
  }) => {
    const modal = useModal();
    const { t } = useTranslation('common');
    const [currentPath, setCurrentPath] = useState<string>('');
    const [entries, setEntries] = useState<DirectoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [manualPath, setManualPath] = useState(value);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredEntries = useMemo(() => {
      let filtered = entries;
      
      // Filter to only show directories and audio files
      filtered = filtered.filter(entry => 
        entry.is_directory || isAudioFile(entry.name)
      );
      
      if (searchTerm.trim()) {
        filtered = filtered.filter((entry) =>
          entry.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      return filtered;
    }, [entries, searchTerm]);

    useEffect(() => {
      if (modal.visible) {
        setManualPath(value);
        // If value is a file path, navigate to its directory
        if (value && value.includes('/')) {
          const dirPath = value.substring(0, value.lastIndexOf('/'));
          loadDirectory(dirPath || '/');
        } else {
          loadDirectory();
        }
      }
    }, [modal.visible, value]);

    const loadDirectory = async (path?: string) => {
      setLoading(true);
      setError('');

      try {
        const result: DirectoryListResponse = await fileSystemApi.list(path);

        if (!result || typeof result !== 'object') {
          throw new Error('Invalid response from file system API');
        }
        const entries = Array.isArray(result.entries) ? result.entries : [];
        setEntries(entries);
        const newPath = result.current_path || '';
        setCurrentPath(newPath);
        if (path) {
          // Don't update manualPath when navigating directories
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load directory'
        );
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };

    const handleEntryClick = (entry: DirectoryEntry) => {
      if (entry.is_directory) {
        setSearchTerm('');
        loadDirectory(entry.path);
      } else if (isAudioFile(entry.name)) {
        // Select the audio file
        setManualPath(entry.path);
      }
    };

    const handleParentDirectory = () => {
      const parentPath = currentPath.split('/').slice(0, -1).join('/');
      const newPath = parentPath || '/';
      loadDirectory(newPath);
    };

    const handleHomeDirectory = () => {
      loadDirectory();
    };

    const handleManualPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setManualPath(e.target.value);
    };

    const handleManualPathSubmit = () => {
      // If it looks like a directory, navigate to it
      if (manualPath && !isAudioFile(manualPath)) {
        loadDirectory(manualPath);
      }
    };

    const handleSelect = () => {
      if (manualPath && isAudioFile(manualPath)) {
        modal.resolve(manualPath);
        modal.hide();
      }
    };

    const handleCancel = () => {
      modal.resolve(null);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    const isValidSelection = manualPath && isAudioFile(manualPath);

    return (
      <div className="fixed inset-0 z-[10000] pointer-events-none [&>*]:pointer-events-auto">
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="max-w-[600px] w-full h-[700px] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
              {/* Legend */}
              <div className="text-xs text-muted-foreground border-b pb-2">
                Click a folder to navigate, click an audio file to select it
              </div>

              {/* Manual path input */}
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  Selected File
                </div>
                <div className="flex space-x-2 min-w-0">
                  <Input
                    value={manualPath}
                    onChange={handleManualPathChange}
                    placeholder="/path/to/your/sound.wav"
                    className={`flex-1 min-w-0 ${isValidSelection ? 'border-green-500' : ''}`}
                  />
                  <Button
                    onClick={handleManualPathSubmit}
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {t('folderPicker.go')}
                  </Button>
                </div>
              </div>

              {/* Search input */}
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t('folderPicker.searchLabel')}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter files..."
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
                    {searchTerm.trim()
                      ? 'No matches found'
                      : 'No audio files found in this directory'}
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredEntries.map((entry, index) => {
                      const isAudio = !entry.is_directory && isAudioFile(entry.name);
                      const isSelected = manualPath === entry.path;
                      
                      return (
                        <div
                          key={index}
                          className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-accent ${
                            isSelected ? 'bg-accent ring-2 ring-primary' : ''
                          }`}
                          onClick={() => handleEntryClick(entry)}
                          title={entry.name}
                        >
                          {entry.is_directory ? (
                            <Folder className="h-4 w-4 text-blue-600 flex-shrink-0" />
                          ) : isAudio ? (
                            <Music className="h-4 w-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <File className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          )}
                          <span className="text-sm flex-1 truncate min-w-0">
                            {entry.name}
                          </span>
                          {isAudio && (
                            <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded flex-shrink-0">
                              Audio
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancel}>
                {t('buttons.cancel')}
              </Button>
              <Button
                onClick={handleSelect}
                disabled={!isValidSelection}
              >
                Select Audio File
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

export const AudioFilePickerDialog = defineModal<
  AudioFilePickerDialogProps,
  string | null
>(AudioFilePickerDialogImpl);
