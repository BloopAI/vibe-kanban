import { useEffect, useRef, useState } from 'react';
import { VList, VListHandle } from 'virtua';
import { AlertCircle, ArrowDown, Radio, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export type ProcessLogsViewerContentProps = {
  logs: LogEntry[];
  error: string | null;
  /** Connection type for remote streams (undefined for local) */
  connectionType?: ConnectionType;
  sourceKey: string;
};

export function ProcessLogsViewerContent({
  logs,
  error,
  connectionType,
  sourceKey,
}: ProcessLogsViewerContentProps) {
  const listRef = useRef<VListHandle>(null);
  const prevLenRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  // Reset scroll state when the log source changes (new process)
  useEffect(() => {
    prevLenRef.current = 0;
    setAtBottom(true);
  }, [sourceKey]);

  // Auto-follow: scroll to newest entry while user is at the bottom.
  // Uses smooth:false so onScroll fires once at the final position —
  // smooth scrolling fires at intermediate positions which can transiently
  // flip atBottom to false and break the follow loop.
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = logs.length - prev;
    prevLenRef.current = logs.length;

    if (logs.length === 0 || grewBy <= 0) return;
    if (!atBottom) return;

    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex(logs.length - 1, { align: 'end', smooth: false });
    });
  }, [logs.length, atBottom]);

  return (
    <div className="h-full flex flex-col">
      {connectionType && (
        <div className="flex justify-end px-4 py-2 border-b">
          <ConnectionStatusBadge connectionType={connectionType} />
        </div>
      )}
      <div className="relative flex-1 min-h-0">
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
          <>
            <VList
              ref={listRef}
              className="flex-1 rounded-lg"
              data={logs}
              bufferSize={600}
              onScroll={(offset) => {
                const h = listRef.current;
                if (!h) return;
                setAtBottom(offset + h.viewportSize >= h.scrollSize - 5);
              }}
            >
              {(entry, i) => (
                <RawLogText
                  key={i}
                  content={(entry as LogEntry).content}
                  channel={(entry as LogEntry).type === 'STDERR' ? 'stderr' : 'stdout'}
                  className="text-sm px-4 py-1"
                />
              )}
            </VList>
            {!atBottom && (
              <Button
                variant="outline"
                size="icon"
                className="absolute bottom-4 right-4 rounded-full shadow-lg bg-background/90 backdrop-blur-sm hover:bg-background z-10"
                onClick={() => {
                  setAtBottom(true);
                  listRef.current?.scrollToIndex(logs.length - 1, { align: 'end', smooth: false });
                }}
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            )}
          </>
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
        sourceKey={assignmentId}
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
  return <ProcessLogsViewerContent logs={logs} error={error} sourceKey={processId} />;
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
