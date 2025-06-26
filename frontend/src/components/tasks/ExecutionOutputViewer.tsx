import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, MessageSquare } from 'lucide-react';
import { ConversationViewer } from './ConversationViewer';
import type { ExecutionProcess, ExecutionProcessStatus } from 'shared/types';

interface ExecutionOutputViewerProps {
  executionProcess: ExecutionProcess;
  executor?: string;
}

const getExecutionProcessStatusDisplay = (
  status: ExecutionProcessStatus
): { label: string; color: string } => {
  switch (status) {
    case 'running':
      return { label: 'Running', color: 'bg-blue-500' };
    case 'completed':
      return { label: 'Completed', color: 'bg-green-500' };
    case 'failed':
      return { label: 'Failed', color: 'bg-red-500' };
    case 'killed':
      return { label: 'Stopped', color: 'bg-gray-500' };
    default:
      return { label: 'Unknown', color: 'bg-gray-400' };
  }
};

export function ExecutionOutputViewer({
  executionProcess,
  executor,
}: ExecutionOutputViewerProps) {
  const [viewMode, setViewMode] = useState<'conversation' | 'raw'>('raw');

  const isAmpExecutor = executor === 'amp';
  const isClaudeExecutor = executor === 'claude';
  const isGeminiExecutor = executor === 'gemini';
  const hasStdout = !!executionProcess.stdout;
  const hasStderr = !!executionProcess.stderr;

  // Check if stdout looks like JSONL (for Amp, Claude, or Gemini executor)
  const { isValidJsonl, jsonlFormat } = useMemo(() => {
    if (
      (!isAmpExecutor && !isClaudeExecutor && !isGeminiExecutor) ||
      !executionProcess.stdout
    ) {
      return { isValidJsonl: false, jsonlFormat: null };
    }

    try {
      const lines = executionProcess.stdout
        .split('\n')
        .filter((line) => line.trim());
      if (lines.length === 0) return { isValidJsonl: false, jsonlFormat: null };

      // Try to parse at least the first few lines as JSON
      const testLines = lines.slice(0, Math.min(3, lines.length));
      const allValid = testLines.every((line) => {
        try {
          JSON.parse(line);
          return true;
        } catch {
          return false;
        }
      });

      if (!allValid) return { isValidJsonl: false, jsonlFormat: null };

      // Detect format by checking for Amp vs Claude structure
      let hasAmpFormat = false;
      let hasClaudeFormat = false;

      for (const line of testLines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'messages' || parsed.type === 'token-usage') {
            hasAmpFormat = true;
          }
          if (
            parsed.type === 'user' ||
            parsed.type === 'assistant' ||
            parsed.type === 'system' ||
            parsed.type === 'result'
          ) {
            hasClaudeFormat = true;
          }
        } catch {
          // Skip invalid lines
        }
      }

      return {
        isValidJsonl: true,
        jsonlFormat: hasAmpFormat
          ? 'amp'
          : hasClaudeFormat
            ? 'claude'
            : 'unknown',
      };
    } catch {
      return { isValidJsonl: false, jsonlFormat: null };
    }
  }, [
    isAmpExecutor,
    isClaudeExecutor,
    isGeminiExecutor,
    executionProcess.stdout,
  ]);

  // Set initial view mode based on JSONL detection
  useEffect(() => {
    if (isValidJsonl) {
      setViewMode('conversation');
    }
  }, [isValidJsonl]);

  if (!hasStdout && !hasStderr) {
    return (
      <Card className="bg-muted border-none">
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground italic text-center">
            Waiting for output...
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusDisplay = getExecutionProcessStatusDisplay(
    executionProcess.status
  );

  return (
    <Card className="">
      <CardContent className="p-3">
        <div className="space-y-3">
          {/* Execution process header with status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs capitalize">
                {executionProcess.process_type
                  .replace(/([A-Z])/g, ' $1')
                  .toLowerCase()}
              </Badge>
              <div className="flex items-center gap-1">
                <div
                  className={`h-2 w-2 rounded-full ${statusDisplay.color}`}
                />
                <span className="text-xs text-muted-foreground">
                  {statusDisplay.label}
                </span>
              </div>
              {executor && (
                <Badge variant="secondary" className="text-xs">
                  {executor}
                </Badge>
              )}
            </div>
          </div>

          {/* View mode toggle for executors with valid JSONL */}
          {isValidJsonl && hasStdout && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {jsonlFormat && (
                  <Badge variant="secondary" className="text-xs">
                    {jsonlFormat} format
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={viewMode === 'conversation' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('conversation')}
                  className="h-7 px-2 text-xs"
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Conversation
                </Button>
                <Button
                  variant={viewMode === 'raw' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('raw')}
                  className="h-7 px-2 text-xs"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Raw
                </Button>
              </div>
            </div>
          )}

          {/* Output content */}
          {hasStdout && (
            <div>
              {isValidJsonl && viewMode === 'conversation' ? (
                <ConversationViewer
                  jsonlOutput={executionProcess.stdout || ''}
                />
              ) : (
                <div>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap p-2">
                    {executionProcess.stdout}
                  </pre>
                </div>
              )}
            </div>
          )}

          {hasStderr && (
            <div>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap p-2 text-red-600">
                {executionProcess.stderr}
              </pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
