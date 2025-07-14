import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { useConfig } from './config-provider';
import { Check, Clipboard } from 'lucide-react';

export function GitHubLoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { config, loading, githubTokenInvalid } = useConfig();
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceState, setDeviceState] = useState<null | {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAuthenticated =
    !!(config?.github?.username && config?.github?.token) &&
    !githubTokenInvalid;

  const handleLogin = async () => {
    setFetching(true);
    setError(null);
    setDeviceState(null);
    try {
      const res = await fetch('/api/auth/github/device/start', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.data) {
        setDeviceState(data.data);
        setPolling(true);
      } else {
        setError(data.message || 'Failed to start GitHub login.');
      }
    } catch (e) {
      console.error(e);
      setError('Network error');
    } finally {
      setFetching(false);
    }
  };

  // Poll for completion
  useEffect(() => {
    let timer: number;
    if (polling && deviceState) {
      const poll = async () => {
        try {
          const res = await fetch('/api/auth/github/device/poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: deviceState.device_code }),
          });
          const data = await res.json();
          if (data.success) {
            setPolling(false);
            setDeviceState(null);
            setError(null);
            window.location.reload(); // reload config
          } else if (data.message === 'authorization_pending') {
            // keep polling
            timer = setTimeout(poll, (deviceState.interval || 5) * 1000);
          } else if (data.message === 'slow_down') {
            // increase interval
            timer = setTimeout(poll, (deviceState.interval + 5) * 1000);
          } else if (data.message === 'expired_token') {
            setPolling(false);
            setError('Device code expired. Please try again.');
            setDeviceState(null);
          } else {
            setPolling(false);
            setError(data.message || 'Login failed.');
            setDeviceState(null);
          }
        } catch (e) {
          setPolling(false);
          setError('Network error');
        }
      };
      timer = setTimeout(poll, deviceState.interval * 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [polling, deviceState]);

  // Automatically copy code to clipboard when deviceState is set
  useEffect(() => {
    if (deviceState?.user_code) {
      copyToClipboard(deviceState.user_code);
    }
  }, [deviceState?.user_code]);

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback for environments where clipboard API is not available
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.warn('Copy to clipboard failed:', err);
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} uncloseable>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in with GitHub</DialogTitle>
          <DialogDescription>
            Connect your GitHub account to use Vibe Kanban.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center">Loading…</div>
        ) : isAuthenticated ? (
          <div className="py-8 text-center">
            <div className="mb-2">
              You are signed in as <b>{config?.github?.username ?? ''}</b>.
            </div>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : deviceState ? (
          <div className="py-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">
                  1
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    Go to GitHub Device Authorization
                  </p>
                  <a
                    href={deviceState.verification_uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm underline"
                  >
                    {deviceState.verification_uri}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">
                  2
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 mb-3">
                    Enter this code:
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-mono font-bold tracking-[0.2em] bg-gray-50 border rounded-lg px-4 py-2 text-gray-900">
                      {deviceState.user_code}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(deviceState.user_code)}
                      disabled={copied}
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Clipboard className="w-4 h-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm text-muted-foreground">
                {copied
                  ? 'Code copied to clipboard!'
                  : 'Waiting for you to authorize…'}
              </div>
            </div>
            {error && <div className="text-red-500 mt-2">{error}</div>}
          </div>
        ) : (
          <>
            {error && <div className="text-red-500 mb-2">{error}</div>}
            <DialogFooter>
              <Button onClick={handleLogin} disabled={fetching}>
                {fetching ? 'Starting…' : 'Sign in with GitHub'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
