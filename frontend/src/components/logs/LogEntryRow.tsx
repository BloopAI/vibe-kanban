import { memo } from 'react';
import type { UnifiedLogEntry } from '@/types/logs';
import type { NormalizedEntry } from 'shared/types';
import StdoutEntry from './StdoutEntry';
import StderrEntry from './StderrEntry';
import RawEntry from './RawEntry';
import DisplayConversationEntry from '@/components/NormalizedConversation/DisplayConversationEntry';

interface LogEntryRowProps {
  entry: UnifiedLogEntry;
  index: number;
  style?: React.CSSProperties;
}

function LogEntryRow({ entry, index, style }: LogEntryRowProps) {
  const content = (
    <div className="px-4 py-1">
      {(() => {
        switch (entry.channel) {
          case 'stdout':
            return (
              <StdoutEntry
                content={entry.payload as string}
                processName={entry.processName}
                timestamp={entry.ts}
              />
            );
          case 'stderr':
            return (
              <StderrEntry
                content={entry.payload as string}
                processName={entry.processName}
                timestamp={entry.ts}
              />
            );
          case 'raw':
            return (
              <RawEntry
                content={entry.payload as string}
                processName={entry.processName}
                timestamp={entry.ts}
              />
            );
          case 'normalized':
            return (
              <div className="border-l-2 border-blue-200 pl-3">
                <div className="text-xs text-gray-500 mb-1">
                  {new Date(entry.ts).toLocaleTimeString()} [{entry.processName}]
                </div>
                <DisplayConversationEntry
                  entry={entry.payload as NormalizedEntry}
                  index={index}
                  diffDeletable={false}
                />
              </div>
            );
          default:
            return (
              <div className="text-red-500 text-xs">
                Unknown log type: {entry.channel}
              </div>
            );
        }
      })()}
    </div>
  );

  return style ? (
    <div style={style}>
      {content}
    </div>
  ) : (
    content
  );
}

// Memoize to optimize react-window performance
export default memo(LogEntryRow);
