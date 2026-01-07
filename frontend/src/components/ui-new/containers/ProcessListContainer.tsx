import { useEffect, useMemo, useCallback } from 'react';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { ProcessListItem } from '../primitives/ProcessListItem';
import { SectionHeader } from '../primitives/SectionHeader';

interface ProcessListContainerProps {
  selectedProcessId: string | null;
  onSelectProcess: (processId: string) => void;
  disableAutoSelect?: boolean;
}

export function ProcessListContainer({
  selectedProcessId,
  onSelectProcess,
  disableAutoSelect,
}: ProcessListContainerProps) {
  const { executionProcessesVisible } = useExecutionProcessesContext();

  // Sort processes by created_at descending (newest first)
  const sortedProcesses = useMemo(() => {
    return [...executionProcessesVisible].sort((a, b) => {
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [executionProcessesVisible]);

  // Auto-select latest process if none selected (unless disabled)
  useEffect(() => {
    if (
      !disableAutoSelect &&
      !selectedProcessId &&
      sortedProcesses.length > 0
    ) {
      onSelectProcess(sortedProcesses[0].id);
    }
  }, [disableAutoSelect, selectedProcessId, sortedProcesses, onSelectProcess]);

  const handleSelectProcess = useCallback(
    (processId: string) => {
      onSelectProcess(processId);
    },
    [onSelectProcess]
  );

  if (sortedProcesses.length === 0) {
    return (
      <div className="w-full h-full bg-secondary flex flex-col">
        <SectionHeader title="Processes" />
        <div className="flex-1 flex items-center justify-center text-low">
          <p className="text-sm">No processes to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-secondary flex flex-col overflow-hidden">
      <SectionHeader title="Processes" />
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent p-base">
        <div className="space-y-0">
          {sortedProcesses.map((process) => (
            <ProcessListItem
              key={process.id}
              runReason={process.run_reason}
              status={process.status}
              startedAt={process.started_at}
              selected={process.id === selectedProcessId}
              onClick={() => handleSelectProcess(process.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
