import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Code,
  Eye,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  RefreshCw,
  GripVertical,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import FileContentView from '@/components/NormalizedConversation/FileContentView';
import { writeClipboardViaBridge } from '@/vscode/bridge';
import { fileBrowserApi } from '@/lib/api';
import { useFileViewer } from '@/contexts/FileViewerContext';
import { cn } from '@/lib/utils';

/** localStorage key for persisting panel width preference */
const STORAGE_KEY = 'file-viewer-panel-width';
/** Minimum allowed panel width in pixels */
const MIN_WIDTH = 300;
/** Maximum allowed panel width in pixels */
const MAX_WIDTH = 600;
/** Default panel width in pixels when no preference is stored */
const DEFAULT_WIDTH = 400;

/**
 * Desktop/tablet side panel for viewing files.
 * Slides in from the right with a resizable width (300-600px).
 *
 * Features:
 * - Resizable panel width with drag handle (persisted to localStorage)
 * - Multiple file support with dropdown selector
 * - Toggle between rendered markdown preview and raw source view
 * - Copy to clipboard functionality
 * - Refresh button to reload file content
 * - Keyboard shortcuts: Escape to close, Cmd/Ctrl+R to refresh
 * - Loading and error states
 *
 * Uses FileViewerContext for state management, so must be rendered
 * within a FileViewerProvider.
 *
 * @example
 * ```tsx
 * // Typically used within FileViewerContainer
 * <FileViewerSidePanel />
 * ```
 */
export function FileViewerSidePanel() {
  const {
    isOpen,
    files,
    activeFileIndex,
    viewMode,
    closePanel,
    setActiveFile,
    setViewMode,
  } = useFileViewer();

  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        return parsed;
      }
    }
    return DEFAULT_WIDTH;
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const activeFile = files[activeFileIndex];
  const fileName = activeFile?.path.split('/').pop() || '';
  const isMarkdown = /\.(md|markdown|mdx)$/i.test(fileName);

  // Fetch file content
  const {
    data: fileData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'file-viewer',
      activeFile?.path,
      activeFile?.relativePath,
      activeFile?.attemptId,
      activeFile?.isAbsolutePath,
    ],
    queryFn: async () => {
      if (!activeFile) throw new Error('No file selected');

      if (activeFile.isAbsolutePath) {
        return fileBrowserApi.readAbsoluteFile(activeFile.path);
      }
      if (activeFile.relativePath) {
        return fileBrowserApi.readClaudeFile(activeFile.relativePath);
      }
      if (activeFile.attemptId) {
        return fileBrowserApi.readWorktreeFile(
          activeFile.attemptId,
          activeFile.path
        );
      }
      throw new Error('No file source specified');
    },
    enabled: isOpen && !!activeFile,
  });

  const content = fileData?.content || null;

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close panel
      if (e.key === 'Escape') {
        closePanel();
        return;
      }

      // Cmd/Ctrl+R to refresh file content
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault(); // Prevent browser refresh
        refetch();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closePanel, refetch]);

  // Copy content to clipboard
  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      await writeClipboardViaBridge(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail - writeClipboardViaBridge handles fallback
    }
  }, [content]);

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate new width based on distance from right edge of viewport
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Persist to localStorage on drag end
      localStorage.setItem(STORAGE_KEY, panelWidth.toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, panelWidth]);

  if (!isOpen || files.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          className={cn(
            'border-l border-border',
            'flex flex-col h-full',
            'bg-background',
            'relative',
            isDragging && 'select-none'
          )}
          style={{ width: `${panelWidth}px` }}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {/* Resize handle */}
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 w-1',
              'cursor-col-resize',
              'group hover:bg-primary/20',
              isDragging && 'bg-primary/30'
            )}
            onMouseDown={handleMouseDown}
            aria-label="Resize panel"
          >
            <div
              className={cn(
                'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                'opacity-0 group-hover:opacity-100 transition-opacity',
                'text-muted-foreground',
                isDragging && 'opacity-100'
              )}
            >
              <GripVertical className="h-6 w-6" />
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-sm font-medium">File Preview</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={closePanel}
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* File selector and toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            {/* File dropdown */}
            <Select
              value={activeFileIndex.toString()}
              onValueChange={(value) => setActiveFile(parseInt(value, 10))}
            >
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="Select a file" />
              </SelectTrigger>
              <SelectContent>
                {files.map((file, index) => (
                  <SelectItem
                    key={`${file.path}-${index}`}
                    value={index.toString()}
                  >
                    {file.path.split('/').pop()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* View mode toggle - only for markdown files */}
            {isMarkdown && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() =>
                  setViewMode(viewMode === 'preview' ? 'raw' : 'preview')
                }
                aria-label={
                  viewMode === 'preview' ? 'Show raw' : 'Show preview'
                }
                title={
                  viewMode === 'preview' ? 'Show raw source' : 'Show preview'
                }
              >
                {viewMode === 'preview' ? (
                  <Code className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Refresh button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => refetch()}
              disabled={isLoading}
              aria-label="Refresh"
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
            </Button>

            {/* Copy button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleCopy}
              disabled={!content}
              aria-label="Copy content"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-auto p-4">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error instanceof Error
                    ? error.message
                    : 'Failed to load file'}
                </AlertDescription>
              </Alert>
            )}

            {content && !isLoading && !error && (
              <>
                {viewMode === 'preview' && isMarkdown ? (
                  <MarkdownRenderer content={content} className="max-w-none" />
                ) : (
                  <FileContentView
                    content={content}
                    lang={getLanguageFromFilename(fileName)}
                  />
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Determine the language identifier from a filename for syntax highlighting.
 *
 * @param filename - The name of the file (e.g., "example.tsx")
 * @returns The language identifier (e.g., "typescript") or "text" if unknown
 */
function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    sql: 'sql',
    md: 'markdown',
    markdown: 'markdown',
    mdx: 'markdown',
  };
  return languageMap[ext || ''] || 'text';
}
