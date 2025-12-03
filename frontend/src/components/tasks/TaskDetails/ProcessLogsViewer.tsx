import { useEffect, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { AlertCircle, Radio, Wifi, WifiOff } from 'lucide-react';
import { useLogStream } from '@/hooks/useLogStream';
import {
  useNodeLogStream,
  type NodeLogEntry,
  type ConnectionType,
} from '@/hooks/useNodeLogStream';
import RawLogText from '@/components/common/RawLogText';
import type { PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface ProcessLogsViewerProps {
  processId: string;
  /** Optional assignment ID for streaming logs from a remote node via the hive */
  assignmentId?: string;
}

/** Connection status indicator for remote node streams */
function ConnectionStatusBadge({
  connectionType,
}: {
  connectionType: ConnectionType;
}) {
  const getIcon = () => {
    switch (connectionType) {
      case 'direct':
        return <Wifi className="h-3 w-3" />;
      case 'relay':
        return <Radio className="h-3 w-3" />;
      case 'connecting':
        return <Wifi className="h-3 w-3 animate-pulse" />;
      case 'disconnected':
        return <WifiOff className="h-3 w-3" />;
    }
  };

  const getLabel = () => {
    switch (connectionType) {
      case 'direct':
        return 'Direct';
      case 'relay':
        return 'Relay';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
    }
  };

  const getColor = () => {
    switch (connectionType) {
      case 'direct':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'relay':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'connecting':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'disconnected':
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${getColor()}`}
    >
      {getIcon()}
      {getLabel()}
    </span>
  );
}

export function ProcessLogsViewerContent({
  logs,
  error,
  connectionType,
}: {
  logs: LogEntry[];
  error: string | null;
  /** Connection type for remote streams (undefined for local) */
  connectionType?: ConnectionType;
}) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const didInitScroll = useRef(false);
  const prevLenRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  // 1) Initial jump to bottom once data appears.
  useEffect(() => {
    if (!didInitScroll.current && logs.length > 0) {
      didInitScroll.current = true;
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: logs.length - 1,
          align: 'end',
        });
      });
    }
  }, [logs.length]);

  // 2) If there's a large append and we're at bottom, force-stick to the last item.
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = logs.length - prev;
    prevLenRef.current = logs.length;

    // tweak threshold as you like; this handles "big bursts"
    const LARGE_BURST = 10;
    if (grewBy >= LARGE_BURST && atBottom && logs.length > 0) {
      // defer so Virtuoso can re-measure before jumping
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: logs.length - 1,
          align: 'end',
        });
      });
    }
  }, [logs.length, atBottom, logs]);

  const formatLogLine = (entry: LogEntry, index: number) => {
    return (
      <RawLogText
        key={index}
        content={entry.content}
        channel={entry.type === 'STDERR' ? 'stderr' : 'stdout'}
        className="text-sm px-4 py-1"
      />
    );
  };

  return (
    <div className="h-full flex flex-col">
      {connectionType && (
        <div className="flex justify-end px-4 py-2 border-b">
          <ConnectionStatusBadge connectionType={connectionType} />
        </div>
      )}
      <div className="flex-1 min-h-0">
        {logs.length === 0 && !error ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No logs available
          </div>
        ) : error ? (
          <div className="p-4 text-center text-destructive text-sm">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            {error}
          </div>
        ) : (
          <Virtuoso<LogEntry>
            ref={virtuosoRef}
            className="flex-1 rounded-lg"
            data={logs}
            itemContent={(index, entry) =>
              formatLogLine(entry as LogEntry, index)
            }
            // Keep pinned while user is at bottom; release when they scroll up
            atBottomStateChange={setAtBottom}
            followOutput={atBottom ? 'smooth' : false}
            // Optional: a bit more overscan helps during bursts
            increaseViewportBy={{ top: 0, bottom: 600 }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Wrapper component for viewing logs from a remote node via the hive.
 * Converts NodeLogEntry format to LogEntry format for the content component.
 */
export function NodeProcessLogsViewer({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const { logs, error, connectionType, retry } = useNodeLogStream(assignmentId);

  // Convert NodeLogEntry to LogEntry format
  const convertedLogs: LogEntry[] = logs.map((entry: NodeLogEntry) => ({
    type: entry.output_type === 'stderr' ? 'STDERR' : 'STDOUT',
    content: entry.content,
  }));

  return (
    <div className="h-full flex flex-col">
      <ProcessLogsViewerContent
        logs={convertedLogs}
        error={error}
        connectionType={connectionType}
      />
      {connectionType === 'disconnected' && error && (
        <div className="p-2 border-t">
          <button
            onClick={retry}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Retry Connection
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Local process logs viewer using direct WebSocket connection.
 */
function LocalProcessLogsViewer({ processId }: { processId: string }) {
  const { logs, error } = useLogStream(processId);
  return <ProcessLogsViewerContent logs={logs} error={error} />;
}

export default function ProcessLogsViewer({
  processId,
  assignmentId,
}: ProcessLogsViewerProps) {
  // If an assignment ID is provided, use the node log stream (remote via hive)
  if (assignmentId) {
    return <NodeProcessLogsViewer assignmentId={assignmentId} />;
  }

  // Otherwise, use the local log stream
  return <LocalProcessLogsViewer processId={processId} />;
}
