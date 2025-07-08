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
  const { config, loading } = useConfig();
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

  const isAuthenticated = !!(config?.github?.username && config?.github?.token);

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
      navigator.clipboard.writeText(deviceState.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [deviceState?.user_code]);

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
          <div className="py-4 text-center">
            <div className="mb-2">
              1. Go to{' '}
              <a
                href={deviceState.verification_uri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 font-medium hover:text-blue-600 transition-colors"
                style={{ textDecoration: 'none' }}
              >
                {deviceState.verification_uri}
              </a>
            </div>
            <div className="mb-2">2. Enter this code:</div>
            <div className="mb-4 flex items-center justify-center gap-2">
              <span className="text-2xl font-mono font-bold tracking-widest bg-gray-100 rounded p-2">
                {deviceState.user_code}
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(deviceState.user_code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="w-28"
                disabled={copied}
              >
                {copied ? 'Copied' : 'Copy'}
                {copied ? (
                  <Check className="ml-1.5 w-5 h-5" />
                ) : (
                  <Clipboard className="ml-1.5 w-5 h-5" />
                )}
              </Button>
            </div>
            <div className="mb-2 text-muted-foreground text-sm">
              {copied
                ? 'Code copied to clipboard!'
                : 'Waiting for you to authorize…'}
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
