import { useState, useEffect, useRef } from 'react';
import {
  ExternalLink,
  RefreshCw,
  Copy,
  Loader2,
  MonitorSpeaker,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useDevserverPreview,
} from '@/hooks/useDevserverPreview';
import { ClickToComponentListener } from '@/utils/previewBridge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { TaskAttempt } from 'shared/types';
import { Alert } from '@/components/ui/alert';

interface PreviewTabProps {
  selectedAttempt: TaskAttempt;
  projectId: string;
  projectHasDevScript: boolean;
}

export default function PreviewTab({
  selectedAttempt,
  projectId,
  projectHasDevScript,
}: PreviewTabProps) {
  const [iframeError, setIframeError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadingTimeFinished, setLoadingTimeFinished] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const listenerRef = useRef<ClickToComponentListener | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewState = useDevserverPreview(selectedAttempt.id, {
    projectHasDevScript,
    projectId,
  });

  const handleRefresh = () => {
    setIframeError(false);
    setRefreshKey((prev) => prev + 1);
  };
  const handleIframeError = () => {
    setIframeError(true);
  };

  const { addElement } = useClickedElements();

  const handleCopyUrl = async () => {
    if (previewState.url) {
      await navigator.clipboard.writeText(previewState.url);
    }
  };

  // Set up message listener when iframe is ready
  useEffect(() => {
    if (previewState.status !== 'ready' || !previewState.url || !addElement) {
      return;
    }

    const listener = new ClickToComponentListener({
      onOpenInEditor: (payload) => {
        addElement(payload);
      },
      onReady: () => {
        console.log("DEBUG2")
        setIsReady(true);
      },
    });

    listener.start();
    listenerRef.current = listener;

    return () => {
      listener.stop();
      listenerRef.current = null;
    };
  }, [previewState.status, previewState.url, addElement]);

  // If the preview status isn't ready, and it's been five seconds and we haven't received a ready message, set notReadyInTime true
  useEffect(() => {
    setTimeout(() => {
      setLoadingTimeFinished(true);
    }, 5000);
  }, []);

  if (previewState.status === 'searching') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md mx-auto p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Waiting for dev server...
            </h3>
            <p className="text-sm text-muted-foreground">
              Looking for development server URL in the logs. This typically
              appears when running commands like:
            </p>
            <ul className="text-xs text-muted-foreground mt-2 list-disc list-inside space-y-1">
              <li>
                <code>npm run dev</code> or <code>yarn dev</code>
              </li>
              <li>
                <code>vite</code> or <code>next dev</code>
              </li>
              <li>
                <code>webpack-dev-server</code>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (previewState.status !== 'ready' || !previewState.url) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md mx-auto p-6">
            <div className="flex items-center justify-center">
              <MonitorSpeaker className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                No dev server detected
              </h3>
              <p className="text-sm text-muted-foreground">
                No development server URL found in the logs yet. Start a dev
                server to see the preview here.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Looking for URLs matching: <code>localhost:PORT</code>,{' '}
                <code>127.0.0.1:PORT</code>, or <code>0.0.0.0:PORT</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (iframeError) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b bg-muted/50">
          <span className="text-sm text-muted-foreground font-mono truncate flex-1">
            {previewState.url}
          </span>
          <Button size="sm" variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopyUrl}>
            <Copy className="h-4 w-4 mr-1" />
            Copy URL
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a
              href={previewState.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open External
            </a>
          </Button>
        </div>

        {/* Error state */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md mx-auto p-6">
            <div className="text-destructive">
              <MonitorSpeaker className="h-8 w-8 mx-auto mb-2" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                Preview unavailable
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                The iframe couldn't load the preview. This might be due to:
              </p>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1 mb-4">
                <li>Mixed content restrictions (HTTPS ↔ HTTP)</li>
                <li>Server not ready or crashed</li>
                <li>CORS or X-Frame-Options blocking</li>
              </ul>
              <Button onClick={handleRefresh} className="mr-2">
                <RefreshCw className="h-4 w-4 mr-1" />
                Retry
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={previewState.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open External
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b bg-muted/50 shrink-0">
        <span className="text-sm text-muted-foreground font-mono truncate flex-1">
          {previewState.url}
        </span>
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopyUrl}>
          <Copy className="h-4 w-4 mr-1" />
          Copy URL
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a
            href={previewState.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center"
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Open External
          </a>
        </Button>
      </div>
      {loadingTimeFinished && !isReady && (
        <Alert>
          It looks like we're having trouble loading a preview of your application. <span className="font-bold">Please check the following troubleshooting steps:</span>
          <ol className="list-decimal list-inside">
            <li>Have you started the dev server?</li>
            <li>Did you dev server start successfully?</li>
            <li>Does your dev server print the URL and port to the terminal? (this is how we know it's running)</li>
          </ol>
        </Alert>
      )}

      {/* Preview iframe */}
      <iframe
        ref={iframeRef}
        key={`${previewState.url}-${refreshKey}`}
        src={previewState.url}
        title="Dev server preview"
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        referrerPolicy="no-referrer"
        onError={handleIframeError}
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
