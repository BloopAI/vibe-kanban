import type { UnifiedLogEntry, ProcessStartPayload } from '@/types/logs';
import ProcessStartCard from '@/components/logs/ProcessStartCard';
import LogEntryRow from '@/components/logs/LogEntryRow';

type Props = {
  header: ProcessStartPayload;
  entries: UnifiedLogEntry[];
  isCollapsed: boolean;
  onToggle: (processId: string) => void;
  restore?: {
    onRestore: (processId: string) => void;
    restoreProcessId?: string;
    restoreDisabled?: boolean;
    restoreDisabledReason?: string;
  };
};

export default function ProcessGroup({
  header,
  entries,
  isCollapsed,
  onToggle,
  restore,
}: Props) {
  return (
    <div className="px-4 pt-3 space-y-2">
      <div className="w-full">
        <ProcessStartCard
          payload={header}
          isCollapsed={isCollapsed}
          onToggle={onToggle}
          onRestore={restore?.onRestore}
          restoreProcessId={restore?.restoreProcessId}
          restoreDisabled={restore?.restoreDisabled}
          restoreDisabledReason={restore?.restoreDisabledReason}
        />
      </div>

      {!isCollapsed && entries.length > 0 && (
        <div className="border rounded-lg shadow-sm w-full overflow-hidden">
          <div className="px-3 py-2 space-y-1">
            {entries.map((entry, i) => (
              <LogEntryRow key={entry.id} entry={entry} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
