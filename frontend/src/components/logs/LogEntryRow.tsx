import { memo, useEffect, useRef } from 'react';
import type { UnifiedLogEntry } from '@/types/logs';
import type { NormalizedEntry } from 'shared/types';
import StdoutEntry from './StdoutEntry';
import StderrEntry from './StderrEntry';
import DisplayConversationEntry from '@/components/NormalizedConversation/DisplayConversationEntry';

interface LogEntryRowProps {
  entry: UnifiedLogEntry;
  index: number;
  style?: React.CSSProperties;
  setRowHeight: (index: number, height: number) => void;
}

function LogEntryRow({ entry, index, style, setRowHeight }: LogEntryRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowRef.current) {
      setRowHeight(index, rowRef.current.clientHeight);
    }
  }, [rowRef]);

  const content = (
    <div className="px-4 py-1" ref={rowRef}>
      {(() => {
        switch (entry.channel) {
          case 'stdout':
            return (
              <StdoutEntry
                content={entry.payload as string}
              />
            );
          case 'stderr':
            return (
              <StderrEntry
                content={entry.payload as string}
              />
            );
          case 'normalized':
            return (
              <DisplayConversationEntry
                entry={entry.payload as NormalizedEntry}
                index={index}
                diffDeletable={false}
              />
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
