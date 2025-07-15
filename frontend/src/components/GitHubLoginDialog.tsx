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
import { Loader } from './ui/loader';
import { githubAuthApi } from '../lib/api';
import { DeviceStartResponse } from 'shared/types.ts';

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
  const [deviceState, setDeviceState] = useState<null | DeviceStartResponse>(
    null
  );
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
      const data = await githubAuthApi.start();
      setDeviceState(data);
      setPolling(true);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Network error');
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
          await githubAuthApi.poll(deviceState.device_code);
          setPolling(false);
          setDeviceState(null);
          setError(null);
          window.location.reload(); // reload config
        } catch (e: any) {
          if (e?.message === 'authorization_pending') {
            timer = setTimeout(poll, (deviceState.interval || 5) * 1000);
          } else if (e?.message === 'slow_down') {
            timer = setTimeout(poll, (deviceState.interval + 5) * 1000);
          } else if (e?.message === 'expired_token') {
            setPolling(false);
            setError('Device code expired. Please try again.');
            setDeviceState(null);
          } else {
            setPolling(false);
            setError(e?.message || 'Login failed.');
            setDeviceState(null);
          }
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
          <Loader message="Loading…" size={32} className="py-8" />
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
