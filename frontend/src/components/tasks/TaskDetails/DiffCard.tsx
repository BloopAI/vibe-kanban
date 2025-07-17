import { useContext, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { GitCompare } from 'lucide-react';
import type { WorktreeDiff } from 'shared/types.ts';
import { TaskBackgroundRefreshContext } from '@/components/context/taskDetailsContext.ts';
import DiffFile from '@/components/tasks/TaskDetails/DiffFile.tsx';
import { Loader } from '@/components/ui/loader';

interface DiffCardProps {
  diff: WorktreeDiff | null;
  deletable?: boolean;
  compact?: boolean;
  className?: string;
}

export function DiffCard({
  diff,
  deletable = false,
  compact = false,
  className = '',
}: DiffCardProps) {
  const { isBackgroundRefreshing } = useContext(TaskBackgroundRefreshContext);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const collapseAllFiles = () => {
    if (diff) {
      setCollapsedFiles(new Set(diff.files.map((file) => file.path)));
    }
  };

  const expandAllFiles = () => {
    setCollapsedFiles(new Set());
  };

  if (!diff || diff.files.length === 0) {
    return (
      <div
        className={`bg-muted/30 border border-muted rounded-lg p-4 ${className}`}
      >
        <div className="text-center py-4 text-muted-foreground">
          <GitCompare className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No changes detected</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-background border border-border rounded-lg overflow-hidden shadow-sm flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">
            {diff.files.length} file{diff.files.length !== 1 ? 's' : ''} changed
          </div>
          {isBackgroundRefreshing && (
            <div className="flex items-center gap-1">
              <Loader size={12} />
            </div>
          )}
        </div>
        {!compact && diff.files.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAllFiles}
              className="h-6 text-xs"
              disabled={collapsedFiles.size === 0}
            >
              Expand All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={collapseAllFiles}
              className="h-6 text-xs"
              disabled={collapsedFiles.size === diff.files.length}
            >
              Collapse All
            </Button>
          </div>
        )}
      </div>

      {/* Files */}
      <div
        className={`${compact ? 'max-h-80' : 'flex-1 min-h-0'} overflow-y-auto`}
      >
        <div className="space-y-2 p-3">
          {diff.files.map((file, fileIndex) => (
            <DiffFile
              key={fileIndex}
              collapsedFiles={collapsedFiles}
              compact={compact}
              deletable={deletable}
              file={file}
              fileIndex={fileIndex}
              setCollapsedFiles={setCollapsedFiles}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
