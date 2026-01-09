import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Trash2, AlertCircle } from 'lucide-react';
import { useSyncQueueSafe } from '@/contexts/SyncQueueContext';
import { useConnectionSafe } from '@/contexts/ConnectionContext';
import { cn } from '@/lib/utils';
import { Button } from './button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';
import { isOperationFailed } from '@/lib/syncQueue';

interface SyncStatusIndicatorProps {
  className?: string;
}

export function SyncStatusIndicator({ className }: SyncStatusIndicatorProps) {
  const { pendingOperations, pendingCount, failedCount, isSyncing, processQueue, clearFailed } = useSyncQueueSafe();
  const { state: connectionState } = useConnectionSafe();
  const [isOpen, setIsOpen] = useState(false);

  // Don't show if no pending operations
  if (pendingCount === 0) {
    return null;
  }

  const retryableCount = pendingCount - failedCount;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'relative gap-2 h-8',
            failedCount > 0 && 'text-destructive',
            className
          )}
        >
          {isSyncing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : connectionState === 'online' ? (
            <Cloud className="h-4 w-4" />
          ) : (
            <CloudOff className="h-4 w-4" />
          )}
          <span className="text-xs">
            {pendingCount} pending
          </span>
          {failedCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
              {failedCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Pending Changes</h4>
            <span className="text-xs text-muted-foreground">
              {retryableCount} to sync, {failedCount} failed
            </span>
          </div>

          {/* Operations list */}
          <div className="max-h-48 overflow-y-auto space-y-2">
            {pendingOperations.map((operation) => {
              const failed = isOperationFailed(operation);
              return (
                <div
                  key={operation.id}
                  className={cn(
                    'text-xs p-2 rounded border',
                    failed
                      ? 'bg-destructive/10 border-destructive/20'
                      : 'bg-muted/50 border-border'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {failed && (
                      <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{operation.description}</p>
                      <p className="text-muted-foreground">
                        {operation.method} • {new Date(operation.timestamp).toLocaleTimeString()}
                        {operation.retryCount > 0 && (
                          <span className="ml-1">• Retry {operation.retryCount}/{operation.maxRetries}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={() => processQueue()}
              disabled={isSyncing || connectionState !== 'online' || retryableCount === 0}
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', isSyncing && 'animate-spin')} />
              Sync Now
            </Button>
            {failedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearFailed()}
                className="text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear Failed
              </Button>
            )}
          </div>

          {connectionState !== 'online' && (
            <p className="text-xs text-muted-foreground">
              Waiting for connection to sync changes...
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
