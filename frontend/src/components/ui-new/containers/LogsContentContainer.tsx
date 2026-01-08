import { cn } from '@/lib/utils';
import {
  VirtualizedProcessLogs,
  type LogEntry,
} from '../VirtualizedProcessLogs';
import { useLogStream } from '@/hooks/useLogStream';

export type LogsPanelContent =
  | { type: 'process'; processId: string }
  | { type: 'tool'; toolName: string; content: string; command?: string };

interface LogsContentContainerProps {
  content: LogsPanelContent | null;
  className?: string;
}

export function LogsContentContainer({
  content,
  className,
}: LogsContentContainerProps) {
  // Get logs for process content (only when type is 'process')
  const processId = content?.type === 'process' ? content.processId : '';
  const { logs, error } = useLogStream(processId);

  // Empty state
  if (!content) {
    return (
      <div className="w-full h-full bg-secondary flex items-center justify-center text-low">
        <p className="text-sm">Select a process to view logs</p>
      </div>
    );
  }

  // Tool content - render static content using VirtualizedProcessLogs
  if (content.type === 'tool') {
    const toolLogs: LogEntry[] = content.content
      .split('\n')
      .map((line) => ({ type: 'STDOUT' as const, content: line }));

    return (
      <div className={cn('h-full bg-secondary flex flex-col', className)}>
        <div className="px-4 py-2 border-b border-border text-sm font-medium text-normal shrink-0">
          {content.toolName}
        </div>
        {content.command && (
          <div className="px-4 py-2 font-mono text-xs text-low border-b border-border bg-tertiary shrink-0">
            $ {content.command}
          </div>
        )}
        <div className="flex-1 min-h-0">
          <VirtualizedProcessLogs logs={toolLogs} error={null} />
        </div>
      </div>
    );
  }

  // Process logs - render with VirtualizedProcessLogs
  return (
    <div className={cn('h-full bg-secondary', className)}>
      <VirtualizedProcessLogs key={processId} logs={logs} error={error} />
    </div>
  );
}
