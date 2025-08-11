import { memo, useEffect, useRef } from 'react';
import type { UnifiedLogEntry, ProcessStartPayload } from '@/types/logs';
import type { NormalizedEntry } from 'shared/types';
import StdoutEntry from './StdoutEntry';
import StderrEntry from './StderrEntry';
import ProcessStartCard from './ProcessStartCard';
import DisplayConversationEntry from '@/components/NormalizedConversation/DisplayConversationEntry';

interface LogEntryRowProps {
  entry: UnifiedLogEntry;
  index: number;
  style?: React.CSSProperties;
  setRowHeight?: (index: number, height: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (processId: string) => void;
}

function LogEntryRow({
  entry,
  index,
  style,
  setRowHeight,
  isCollapsed,
  onToggleCollapse,
}: LogEntryRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowRef.current && setRowHeight) {
      setRowHeight(index, rowRef.current.clientHeight);
    }
  }, [rowRef, setRowHeight, index]);

  const content = (
    <div className="" ref={rowRef}>
      {(() => {
        switch (entry.channel) {
          case 'stdout':
            return <StdoutEntry content={entry.payload as string} />;
          case 'stderr':
            return <StderrEntry content={entry.payload as string} />;
          case 'normalized':
            return (
              <DisplayConversationEntry
                entry={entry.payload as NormalizedEntry}
                index={index}
                diffDeletable={false}
              />
            );
          case 'process_start':
            return (
              <ProcessStartCard
                payload={entry.payload as ProcessStartPayload}
                isCollapsed={isCollapsed || false}
                onToggle={onToggleCollapse || (() => {})}
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

  return style ? <div style={style}>{content}</div> : content;
}

// Memoize to optimize react-window performance
export default memo(LogEntryRow);
