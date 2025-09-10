import type { UnifiedLogEntry, ProcessStartPayload } from '@/types/logs';
import ProcessStartCard from '@/components/logs/ProcessStartCard';
import LogEntryRow from '@/components/logs/LogEntryRow';

type Props = {
  header: ProcessStartPayload;
  entries: UnifiedLogEntry[];
  isCollapsed: boolean;
  onToggle: (processId: string) => void;
  retry?: {
    onRetry: (processId: string, newPrompt: string) => void;
    retryProcessId?: string;
    retryDisabled?: boolean;
    retryDisabledReason?: string;
  };
};

export default function ProcessGroup({
  header,
  entries,
  isCollapsed,
  onToggle,
  retry,
}: Props) {
  return (
    <div className="px-4 mt-4">
      <ProcessStartCard
        payload={header}
        isCollapsed={isCollapsed}
        onToggle={onToggle}
        onRetry={retry?.onRetry}
        retryProcessId={retry?.retryProcessId}
        retryDisabled={retry?.retryDisabled}
        retryDisabledReason={retry?.retryDisabledReason}
      />
      <div className="text-sm">
        {!isCollapsed &&
          entries.length > 0 &&
          entries.map((entry, i) => (
            <LogEntryRow key={entry.id} entry={entry} index={i} />
          ))}
      </div>
    </div>
  );
}
