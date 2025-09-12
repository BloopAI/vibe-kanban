import { memo } from 'react';
import type { UnifiedLogEntry } from '@/types/logs';
import type { ApprovalRequest, ApprovalResponse } from 'shared/types';
import type { NormalizedEntry } from 'shared/types';
import StdoutEntry from './StdoutEntry';
import StderrEntry from './StderrEntry';
import ApprovalLogEntry from './ApprovalLogEntry';
import ApprovalResponseEntry from './ApprovalResponseEntry';
import DisplayConversationEntry from '@/components/NormalizedConversation/DisplayConversationEntry';

interface LogEntryRowProps {
  entry: UnifiedLogEntry;
  index: number;
  isCollapsed?: boolean;
  onToggleCollapse?: (processId: string) => void;
  onRestore?: (processId: string) => void;
  restoreProcessId?: string;
  restoreDisabled?: boolean;
  restoreDisabledReason?: string;
}

function LogEntryRow({ entry, index }: LogEntryRowProps) {
  switch (entry.channel) {
    case 'stdout':
      return <StdoutEntry content={entry.payload as string} />;
    case 'stderr':
      return <StderrEntry content={entry.payload as string} />;
    case 'normalized':
      return (
        <div className="my-4">
          <DisplayConversationEntry
            entry={entry.payload as NormalizedEntry}
            expansionKey={`${entry.processId}:${index}`}
            diffDeletable={false}
          />
        </div>
      );
    case 'approval_request':
      return (
        <div className="my-4">
          <ApprovalLogEntry
            approval={entry.payload as ApprovalRequest}
            executionProcessId={entry.processId}
            onRespond={(approved, reason) => {
              // Optional callback for UI updates
              console.log('Approval responded:', { approved, reason });
            }}
          />
        </div>
      );
    case 'approval_response':
      return (
        <div className="my-2">
          <ApprovalResponseEntry response={entry.payload as ApprovalResponse} />
        </div>
      );
    default:
      return (
        <div className="text-destructive text-xs">
          Unknown log type: {entry.channel}
        </div>
      );
  }
}

// Memoize to optimize react-window performance
export default memo(LogEntryRow);
