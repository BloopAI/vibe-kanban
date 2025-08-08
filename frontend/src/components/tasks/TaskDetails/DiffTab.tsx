import { useDiffStream } from '@/hooks/useDiffStream';
import { useMemo, useContext } from 'react';
import { TaskSelectedAttemptContext } from '@/components/context/taskDetailsContext.ts';
import { Diff } from 'shared/types';

function DiffTab() {
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { diffs, isConnected, error } = useDiffStream(
    selectedAttempt?.id || null,
    true
  );

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-red-800 text-sm">Failed to load diff: {error}</div>
      </div>
    );
  }

  console.log(JSON.stringify(diffs));

  return (
    <div className="h-full flex flex-col">
      {/* Connection status indicator */}
      {selectedAttempt && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b text-xs text-muted-foreground">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}
          />
          {isConnected ? 'Live' : 'Disconnected'}
        </div>
      )}

      {/* Diff content */}
      <div className="flex-1 min-h-0">

      </div>
    </div>
  );
}

export default DiffTab;
