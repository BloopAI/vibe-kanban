import { useEffect, useMemo, useCallback } from 'react';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { ProcessListItem } from '../primitives/ProcessListItem';
import { SectionHeader } from '../primitives/SectionHeader';
import { InputField } from '../primitives/InputField';
import { CaretUpIcon, CaretDownIcon } from '@phosphor-icons/react';

interface ProcessListContainerProps {
  selectedProcessId: string | null;
  onSelectProcess: (processId: string) => void;
  disableAutoSelect?: boolean;
  // Search props
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  matchCount?: number;
  currentMatchIdx?: number;
  onPrevMatch?: () => void;
  onNextMatch?: () => void;
}

export function ProcessListContainer({
  selectedProcessId,
  onSelectProcess,
  disableAutoSelect,
  searchQuery = '',
  onSearchQueryChange,
  matchCount = 0,
  currentMatchIdx = 0,
  onPrevMatch,
  onNextMatch,
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

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          onPrevMatch?.();
        } else {
          onNextMatch?.();
        }
      } else if (e.key === 'Escape') {
        onSearchQueryChange?.('');
      }
    },
    [onPrevMatch, onNextMatch, onSearchQueryChange]
  );

  const showSearch = onSearchQueryChange !== undefined;

  const searchBar = showSearch && (
    <div
      className="p-base flex items-center gap-2 shrink-0"
      onKeyDown={handleSearchKeyDown}
    >
      <InputField
        value={searchQuery}
        onChange={onSearchQueryChange}
        placeholder="Search logs..."
        variant="search"
        className="flex-1"
      />
      {searchQuery && (
        <>
          <span className="text-xs text-low whitespace-nowrap">
            {matchCount > 0
              ? `${currentMatchIdx + 1} of ${matchCount}`
              : 'No matches'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onPrevMatch}
              disabled={matchCount === 0}
              className="p-1 text-low hover:text-normal disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous match (Shift+Enter)"
            >
              <CaretUpIcon className="size-icon-sm" weight="bold" />
            </button>
            <button
              onClick={onNextMatch}
              disabled={matchCount === 0}
              className="p-1 text-low hover:text-normal disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next match (Enter)"
            >
              <CaretDownIcon className="size-icon-sm" weight="bold" />
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="h-full w-full bg-secondary flex flex-col overflow-hidden">
      <SectionHeader title="Processes" />
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent p-base min-h-0">
        {sortedProcesses.length === 0 ? (
          <div className="h-full flex items-center justify-center text-low">
            <p className="text-sm">No processes to display</p>
          </div>
        ) : (
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
        )}
      </div>
      {searchBar}
    </div>
  );
}
