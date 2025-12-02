import { useCallback, useState } from 'react';
import { Loader2, AlertCircle, Copy, Check, Code, Eye, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import FileContentView from '@/components/NormalizedConversation/FileContentView';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { cn } from '@/lib/utils';
import { isMarkdownFile, getFileLanguage } from '@/hooks/useFileBrowser';
import { writeClipboardViaBridge } from '@/vscode/bridge';
import type { FileContentResponse } from 'shared/types';
import type { MarkdownViewMode } from '@/stores/useFileBrowserStore';

interface FileViewerProps {
  data: FileContentResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  filePath: string | null;
  markdownViewMode: MarkdownViewMode;
  onToggleMarkdownMode: () => void;
  onOpenInEditor?: (filePath: string) => void;
  className?: string;
}

/**
 * File content viewer with syntax highlighting and markdown preview
 */
export function FileViewer({
  data,
  isLoading,
  error,
  filePath,
  markdownViewMode,
  onToggleMarkdownMode,
  onOpenInEditor,
  className,
}: FileViewerProps) {
  const [copied, setCopied] = useState(false);

  const isMarkdown = isMarkdownFile(filePath);
  const language = getFileLanguage(data);
  const fileName = filePath?.split('/').pop() ?? '';

  const handleCopy = useCallback(async () => {
    if (!data?.content) return;
    try {
      await writeClipboardViaBridge(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent fail - bridge handles fallback
    }
  }, [data?.content]);

  const handleOpenInEditor = useCallback(() => {
    if (filePath && onOpenInEditor) {
      onOpenInEditor(filePath);
    }
  }, [filePath, onOpenInEditor]);

  // No file selected state
  if (!filePath) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center h-full text-muted-foreground p-8',
          className
        )}
      >
        <Code className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm">Select a file to view its contents</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center h-full',
          className
        )}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('p-4', className)}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error.message || 'Failed to load file'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // No data (shouldn't happen if no error)
  if (!data) {
    return null;
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with file name and actions */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm truncate" title={filePath}>
            {fileName}
          </span>
          {data.truncated && (
            <span className="text-xs text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded flex-shrink-0">
              truncated
            </span>
          )}
          {data.size_bytes > 0 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatBytes(data.size_bytes)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Markdown view mode toggle */}
          {isMarkdown && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleMarkdownMode}
                    className="h-8 w-8 p-0"
                  >
                    {markdownViewMode === 'preview' ? (
                      <Code className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {markdownViewMode === 'preview' ? 'View raw' : 'View preview'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Copy button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-8 w-8 p-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? 'Copied!' : 'Copy content'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Open in editor button */}
          {onOpenInEditor && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenInEditor}
                    className="h-8 w-8 p-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in editor</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 overflow-auto">
        {isMarkdown && markdownViewMode === 'preview' ? (
          <div className="p-4">
            <MarkdownRenderer content={data.content} />
          </div>
        ) : (
          <FileContentView content={data.content} lang={language} />
        )}
      </div>
    </div>
  );
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number | bigint): string {
  const num = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export default FileViewer;
