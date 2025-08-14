import { useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { AlertCircle } from 'lucide-react';
import { useLogStream } from '@/hooks/useLogStream';
import type { PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface ProcessLogsViewerProps {
  processId: string;
}

export default function ProcessLogsViewer({ processId }: ProcessLogsViewerProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { logs, error } = useLogStream(processId);

  const formatLogLine = (entry: LogEntry, index: number) => {
    let className = 'text-sm font-mono px-4 py-1 whitespace-pre-wrap';
    
    if (entry.type === 'STDERR') {
      className += ' text-destructive';
    } else {
      className += ' text-foreground';
    }

    return (
      <div key={index} className={className}>
        {entry.content}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3">
      <div className="flex-shrink-0">
        <h3 className="text-sm font-medium">Process Logs</h3>
      </div>

      <div className="border rounded-lg bg-card flex-1 min-h-0 flex flex-col">
        {logs.length === 0 && !error ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No logs available
          </div>
        ) : error ? (
          <div className="p-4 text-center text-destructive text-sm">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            {error}
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            className="flex-1 rounded-lg"
            data={logs}
            itemContent={(index, entry) => formatLogLine(entry, index)}
            followOutput={true}
          />
        )}
      </div>
    </div>
  );
}
