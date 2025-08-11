import { useState, useRef } from 'react';
import {
  Play,
  Square,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type {
  ExecutionProcessStatus,
  ExecutionProcessSummary,
} from 'shared/types';
import { useLogStream } from '@/hooks/useLogStream';
import { useProcessConversation } from '@/hooks/useProcessConversation';
import DisplayConversationEntry from '@/components/NormalizedConversation/DisplayConversationEntry';

interface ProcessCardProps {
  process: ExecutionProcessSummary;
}

function ProcessCard({ process }: ProcessCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const isCodingAgent = process.run_reason === 'codingagent';

  // Use appropriate hook based on process type
  const {
    logs,
    isConnected: rawConnected,
    error: rawError,
  } = useLogStream(process.id, showLogs && !isCodingAgent);
  const {
    entries,
    isConnected: normalizedConnected,
    error: normalizedError,
  } = useProcessConversation(process.id, showLogs && isCodingAgent);

  const logEndRef = useRef<HTMLDivElement>(null);
  const isConnected = isCodingAgent ? normalizedConnected : rawConnected;
  const error = isCodingAgent ? normalizedError : rawError;

  const getStatusIcon = (status: ExecutionProcessStatus) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'killed':
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ExecutionProcessStatus) => {
    switch (status) {
      case 'running':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'completed':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'failed':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'killed':
        return 'bg-gray-50 border-gray-200 text-gray-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getDuration = () => {
    const startTime = new Date(process.started_at).getTime();
    const endTime = process.completed_at
      ? new Date(process.completed_at).getTime()
      : Date.now();
    const durationMs = endTime - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);

    if (durationSeconds < 60) {
      return `${durationSeconds}s`;
    }
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          {getStatusIcon(process.status)}
          <div>
            <h3 className="font-medium text-sm">{process.run_reason}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Duration: {getDuration()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span
            className={`inline-block px-2 py-1 text-xs font-medium border rounded-full ${getStatusColor(
              process.status
            )}`}
          >
            {process.status}
          </span>
          {process.exit_code !== null && (
            <p className="text-xs text-muted-foreground mt-1">
              Exit: {process.exit_code.toString()}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 text-xs text-muted-foreground space-y-1">
        <div>
          <span className="font-medium">Started:</span>{' '}
          {formatDate(process.started_at)}
        </div>
        {process.completed_at && (
          <div>
            <span className="font-medium">Completed:</span>{' '}
            {formatDate(process.completed_at)}
          </div>
        )}
        <div>
          <span className="font-medium">Process ID:</span> {process.id}
        </div>
      </div>

      {/* Log section */}
      <div className="mt-3 border-t pt-3">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showLogs ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          View Logs
          {isConnected && <span className="text-green-500">●</span>}
        </button>

        {showLogs && (
          <div className="mt-3">
            {error && <div className="text-red-500 text-sm mb-2">{error}</div>}

            {isCodingAgent ? (
              // Normalized conversation display for coding agents
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="text-gray-400 text-sm">
                    No conversation entries available...
                  </div>
                ) : (
                  entries.map((entry, index) => (
                    <DisplayConversationEntry
                      key={entry.timestamp ?? index}
                      entry={entry}
                      index={index}
                      diffDeletable={false}
                    />
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            ) : (
              // Raw logs display for other processes
              <div className="bg-black text-white text-xs font-mono p-3 rounded-md max-h-64 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-gray-400">No logs available...</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="break-all">
                      {log}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProcessCard;
