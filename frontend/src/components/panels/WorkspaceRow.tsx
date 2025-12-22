import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDiffSummary } from '@/hooks/useDiffSummary';
import type { WorkspaceWithStatus } from 'shared/types';

interface WorkspaceRowProps {
  workspace: WorkspaceWithStatus;
  onClick: () => void;
}

export function WorkspaceRow({ workspace, onClick }: WorkspaceRowProps) {
  const { fileCount, added, deleted } = useDiffSummary(workspace.id);

  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer p-3 hover:bg-accent rounded',
        workspace.archived && 'opacity-50'
      )}
    >
      <div className="flex justify-between items-center">
        <span className="text-foreground font-medium truncate">
          {workspace.name || workspace.branch}
        </span>
        <span className="flex gap-2 text-sm">
          <span className="text-green-500">+{added}</span>
          <span className="text-red-500">-{deleted}</span>
        </span>
      </div>

      <div className="flex justify-between items-center text-sm text-muted-foreground mt-1">
        <div className="flex items-center gap-2">
          {workspace.pinned && (
            <Star className="w-4 h-4 text-orange-400 fill-orange-400" />
          )}
          {workspace.is_running && (
            <span className="text-blue-500">Running</span>
          )}
          {workspace.is_errored && <span className="text-red-500">Error</span>}
          <span>{fileCount} Files changed</span>
        </div>
      </div>
    </div>
  );
}
