import { useCallback } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { GitBranch, FolderTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { useDirectoryListing, useFileContent } from '@/hooks/useFileBrowser';
import {
  useFileBrowserStore,
  type FileSource,
} from '@/stores/useFileBrowserStore';
import { cn } from '@/lib/utils';

interface FilesPanelProps {
  /** Task attempt ID for worktree browsing */
  attemptId?: string;
  /** Project ID for main project browsing */
  projectId?: string;
  /** Callback when user wants to open file in editor */
  onOpenInEditor?: (filePath: string) => void;
  /** Whether to show in compact/mobile mode */
  compact?: boolean;
  className?: string;
}

/**
 * Main file browser panel with tree view and file viewer
 * Supports both worktree and main project browsing
 */
export function FilesPanel({
  attemptId,
  projectId,
  onOpenInEditor,
  compact = false,
  className,
}: FilesPanelProps) {
  const {
    source,
    setSource,
    currentPath,
    setCurrentPath,
    selectedFile,
    setSelectedFile,
    markdownViewMode,
    toggleMarkdownViewMode,
    filterTerm,
    setFilterTerm,
  } = useFileBrowserStore();

  // Determine which ID to use based on source
  const activeId = source === 'worktree' ? attemptId : projectId;

  // Fetch directory listing
  const {
    data: directoryData,
    isLoading: isDirectoryLoading,
    error: directoryError,
  } = useDirectoryListing(source, activeId, currentPath);

  // Fetch file content when a file is selected
  const {
    data: fileData,
    isLoading: isFileLoading,
    error: fileError,
  } = useFileContent(source, activeId, selectedFile);

  const handleNavigate = useCallback(
    (path: string | null) => {
      setCurrentPath(path);
      // Clear file selection when navigating
      setSelectedFile(null);
    },
    [setCurrentPath, setSelectedFile]
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      setSelectedFile(filePath);
    },
    [setSelectedFile]
  );

  const handleSourceToggle = useCallback(
    (newSource: FileSource) => {
      setSource(newSource);
    },
    [setSource]
  );

  // Check if we have the required IDs
  const hasWorktree = !!attemptId;
  const hasProject = !!projectId;
  const canBrowse = (source === 'worktree' && hasWorktree) || (source === 'main' && hasProject);

  // Compact/mobile mode: show either tree or viewer, not both
  if (compact) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        {/* Source toggle header */}
        <SourceToggle
          source={source}
          onSourceChange={handleSourceToggle}
          hasWorktree={hasWorktree}
          hasProject={hasProject}
        />

        {/* Show file viewer if a file is selected, otherwise show tree */}
        {selectedFile ? (
          <div className="flex-1 flex flex-col">
            {/* Back to tree button */}
            <div className="flex-shrink-0 px-2 py-1 border-b">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFile(null)}
                className="h-8 gap-2"
              >
                <FolderTree className="h-4 w-4" />
                Back to files
              </Button>
            </div>
            <FileViewer
              data={fileData}
              isLoading={isFileLoading}
              error={fileError}
              filePath={selectedFile}
              markdownViewMode={markdownViewMode}
              onToggleMarkdownMode={toggleMarkdownViewMode}
              onOpenInEditor={onOpenInEditor}
              className="flex-1"
            />
          </div>
        ) : (
          <FileTree
            data={directoryData}
            isLoading={isDirectoryLoading}
            error={directoryError}
            currentPath={currentPath}
            selectedFile={selectedFile}
            filterTerm={filterTerm}
            onFilterChange={setFilterTerm}
            onNavigate={handleNavigate}
            onSelectFile={handleSelectFile}
            className="flex-1"
          />
        )}
      </div>
    );
  }

  // Desktop mode: split pane with tree and viewer
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Source toggle header */}
      <SourceToggle
        source={source}
        onSourceChange={handleSourceToggle}
        hasWorktree={hasWorktree}
        hasProject={hasProject}
      />

      {/* Split pane content */}
      {canBrowse ? (
        <PanelGroup direction="horizontal" className="flex-1">
          <Panel defaultSize={35} minSize={20} maxSize={50}>
            <FileTree
              data={directoryData}
              isLoading={isDirectoryLoading}
              error={directoryError}
              currentPath={currentPath}
              selectedFile={selectedFile}
              filterTerm={filterTerm}
              onFilterChange={setFilterTerm}
              onNavigate={handleNavigate}
              onSelectFile={handleSelectFile}
              className="h-full"
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

          <Panel defaultSize={65} minSize={30}>
            <FileViewer
              data={fileData}
              isLoading={isFileLoading}
              error={fileError}
              filePath={selectedFile}
              markdownViewMode={markdownViewMode}
              onToggleMarkdownMode={toggleMarkdownViewMode}
              onOpenInEditor={onOpenInEditor}
              className="h-full"
            />
          </Panel>
        </PanelGroup>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
          <p className="text-sm text-center">
            {source === 'worktree'
              ? 'No worktree available. Select an active task attempt.'
              : 'No project selected.'}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Source toggle component (worktree vs main project)
 */
function SourceToggle({
  source,
  onSourceChange,
  hasWorktree,
  hasProject,
}: {
  source: FileSource;
  onSourceChange: (source: FileSource) => void;
  hasWorktree: boolean;
  hasProject: boolean;
}) {
  return (
    <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 border-b bg-muted/30">
      <span className="text-xs text-muted-foreground mr-2">Source:</span>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={source === 'worktree' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onSourceChange('worktree')}
              disabled={!hasWorktree}
              className="h-7 text-xs gap-1.5"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Worktree
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {hasWorktree
              ? 'Browse files in task worktree'
              : 'No worktree available'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={source === 'main' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onSourceChange('main')}
              disabled={!hasProject}
              className="h-7 text-xs gap-1.5"
            >
              <FolderTree className="h-3.5 w-3.5" />
              Main
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {hasProject
              ? 'Browse files in main project'
              : 'No project available'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export default FilesPanel;
