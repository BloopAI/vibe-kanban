import { useState, useRef, useEffect } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Wifi,
  WifiOff,
  AlertCircle,
} from 'lucide-react';
import { useLogStream } from '@/hooks/useLogStream';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ProcessLogsViewerProps {
  processId: string;
}

export default function ProcessLogsViewer({
  processId,
}: ProcessLogsViewerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const { logs, isConnected, error } = useLogStream(
    processId,
    isExpanded && retryKey >= 0 // Include retryKey to force reconnection
  );

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logs.length > 0 && isExpanded) {
      virtuosoRef.current?.scrollToIndex({
        index: logs.length - 1,
        behavior: 'auto',
      });
    }
  }, [logs.length, isExpanded]);

  const handleRetry = () => {
    setRetryKey((prev) => prev + 1);
  };

  const getConnectionIcon = () => {
    if (error) return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (isConnected) return <Wifi className="h-4 w-4 text-green-500" />;
    return <WifiOff className="h-4 w-4 text-gray-500" />;
  };

  const getConnectionStatus = () => {
    if (error) return 'error';
    if (isConnected) return 'live';
    return 'stopped';
  };

  const formatLogLine = (line: string, index: number) => {
    // Handle stdout/stderr prefixes added by useLogStream
    const isStdout = line.startsWith('stdout: ');
    const isStderr = line.startsWith('stderr: ');

    let content = line;
    let className = 'text-sm font-mono px-4 py-1 whitespace-pre-wrap';

    if (isStdout) {
      content = line.substring(8); // Remove "stdout: " prefix
      className += ' text-foreground';
    } else if (isStderr) {
      content = line.substring(8); // Remove "stderr: " prefix
      className += ' text-red-400';
    } else {
      className += ' text-muted-foreground';
    }

    return (
      <div key={index} className={className}>
        {content}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3">
      <div className="flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
          Process Logs
        </button>
        
        <div className="flex items-center gap-2">
          {getConnectionIcon()}
          <Badge 
            variant={getConnectionStatus() === 'live' ? 'default' : 'secondary'}
          >
            {getConnectionStatus()}
          </Badge>
          {error && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="h-6 px-2"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border rounded-lg bg-card flex-1 min-h-0 flex flex-col">
          {logs.length === 0 && !isConnected && !error ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No logs available
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-500 text-sm">
              <AlertCircle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              className="flex-1 rounded-lg"
              data={logs}
              itemContent={(index, line) => formatLogLine(line, index)}
              followOutput="smooth"
            />
          )}
        </div>
      )}
    </div>
  );
}
