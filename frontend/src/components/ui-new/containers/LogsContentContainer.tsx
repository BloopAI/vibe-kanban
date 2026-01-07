import { cn } from '@/lib/utils';
import { VirtualizedProcessLogs } from '../VirtualizedProcessLogs';
import { useLogStream } from '@/hooks/useLogStream';

interface LogsContentContainerProps {
  selectedProcessId: string | null;
  className?: string;
}

export function LogsContentContainer({
  selectedProcessId,
  className,
}: LogsContentContainerProps) {
  // Get logs for selected process
  const { logs, error } = useLogStream(selectedProcessId ?? '');

  if (!selectedProcessId) {
    return (
      <div className="w-full h-full bg-secondary flex items-center justify-center text-low">
        <p className="text-sm">Select a process to view logs</p>
      </div>
    );
  }

  return (
    <div className={cn('h-full bg-secondary', className)}>
      <VirtualizedProcessLogs logs={logs} error={error} />
    </div>
  );
}
