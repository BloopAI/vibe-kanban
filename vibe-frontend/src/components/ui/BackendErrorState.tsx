import { useState } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './button';

interface BackendErrorStateProps {
  error: Error | null;
  onRetry: () => void;
  isRetrying?: boolean;
}

/**
 * BackendErrorState displays a user-friendly error UI when the backend is unavailable.
 * Shows a retry button and collapsible technical details for debugging.
 */
export function BackendErrorState({ error, onRetry, isRetrying = false }: BackendErrorStateProps) {
  const [showDetails, setShowDetails] = useState(false);

  const errorMessage = error?.message || 'Unknown error';
  const timestamp = new Date().toISOString();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Connection Problem
          </h1>
          <p className="text-muted-foreground">
            We're having trouble connecting to our servers. This might be temporary - please try again.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Retrying...' : 'Retry'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowDetails(!showDetails)}
            className="gap-2"
          >
            {showDetails ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show Details
              </>
            )}
          </Button>
        </div>

        {/* Error Details (collapsible) */}
        {showDetails && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="font-medium text-foreground">Error Details</div>
            <div className="space-y-1 text-muted-foreground font-mono text-xs">
              <div>
                <span className="text-foreground/70">Message:</span>{' '}
                {errorMessage}
              </div>
              <div>
                <span className="text-foreground/70">Time:</span>{' '}
                {timestamp}
              </div>
              {error?.name && (
                <div>
                  <span className="text-foreground/70">Type:</span>{' '}
                  {error.name}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Help text */}
        <p className="text-center text-xs text-muted-foreground">
          If this problem persists, please check your internet connection or contact support.
        </p>
      </div>
    </div>
  );
}
