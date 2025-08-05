import { DiffCard } from '@/components/NormalizedConversation/DiffCard.tsx';
import { useDiffStream } from '@/hooks/useDiffStream';
import type { WorktreeDiff, FileDiff } from 'shared/types';
import { useMemo, useContext } from 'react';
import { TaskSelectedAttemptContext } from '@/components/context/taskDetailsContext.ts';

function DiffTab() {
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { diff, isConnected, error } = useDiffStream(selectedAttempt?.id || null, true);

  const worktreeDiff = useMemo((): WorktreeDiff | null => {
    if (!diff) return null;
    
    return {
      files: Object.values(diff.entries).map((entry: any) => {
        // Handle PatchType wrapper properly
        if (entry && typeof entry === 'object' && entry.type === 'FILE_DIFF') {
          return entry.content as FileDiff;
        }
        // In case it's already unwrapped or a different format
        return entry as FileDiff;
      })
    };
  }, [diff]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-red-800 text-sm">
          Failed to load diff: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Connection status indicator */}
      {selectedAttempt && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b text-xs text-muted-foreground">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
          {isConnected ? 'Live' : 'Disconnected'}
        </div>
      )}
      
      {/* Diff content */}
      <div className="flex-1 min-h-0">
        <DiffCard 
          diff={worktreeDiff}
          deletable={false}
          compact={false}
          className="h-full"
        />
      </div>
    </div>
  );
}

export default DiffTab;
