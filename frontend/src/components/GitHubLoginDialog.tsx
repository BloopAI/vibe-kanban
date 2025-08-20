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
import { Check, Clipboard, Github } from 'lucide-react';
import { Loader } from './ui/loader';
import { githubAuthApi } from '../lib/api';
import { DeviceFlowStartResponse, DevicePollStatus } from 'shared/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export function GitHubLoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { config, loading, githubTokenInvalid, reloadSystem } = useConfig();
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceState, setDeviceState] =
    useState<null | DeviceFlowStartResponse>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAuthenticated =
    !!(config?.github?.username && config?.github?.oauth_token) &&
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
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (polling && deviceState) {
      const poll = async () => {
        try {
          const poll_status = await githubAuthApi.poll();
          switch (poll_status) {
            case DevicePollStatus.SUCCESS:
              setPolling(false);
              setDeviceState(null);
              setError(null);
              await reloadSystem();
              onOpenChange(false);
              break;
            case DevicePollStatus.AUTHORIZATION_PENDING:
              timer = setTimeout(poll, deviceState.interval * 1000);
              break;
            case DevicePollStatus.SLOW_DOWN:
              timer = setTimeout(poll, (deviceState.interval + 5) * 1000);
          }
        } catch (e: any) {
          if (e?.message === 'expired_token') {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Github className="h-6 w-6 text-primary" />
            <DialogTitle>Sign in with GitHub</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-1">
            Connect your GitHub account to create and manage pull requests
            directly from Vibe Kanban.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <Loader message="Loading…" size={32} className="py-8" />
        ) : isAuthenticated ? (
          <div className="space-y-4 py-3">
            <Card>
              <CardContent className="text-center py-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Check className="h-8 w-8 text-green-500" />
                  <Github className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-lg font-medium mb-1">
                  Successfully connected!
                </div>
                <div className="text-sm text-muted-foreground">
                  You are signed in as <b>{config?.github?.username ?? ''}</b>
                </div>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : deviceState ? (
          <div className="space-y-4 py-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Complete GitHub Authorization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-semibold">
                    1
                  </span>
                  <div>
                    <p className="text-sm font-medium mb-1">
                      Go to GitHub Device Authorization
                    </p>
                    <a
                      href={deviceState.verification_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 text-sm underline"
                    >
                      {deviceState.verification_uri}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-semibold">
                    2
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-3">Enter this code:</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-mono font-bold tracking-[0.2em] bg-muted border rounded-lg px-4 py-2">
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
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
              <Github className="h-3 w-3 flex-shrink-0" />
              <span>
                {copied
                  ? 'Code copied to clipboard! Complete the authorization on GitHub.'
                  : 'Waiting for you to authorize this application on GitHub...'}
              </span>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="text-destructive text-sm">{error}</div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Skip
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Why do you need GitHub access?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Create pull requests</p>
                    <p className="text-xs text-muted-foreground">
                      Generate PRs directly from your task attempts
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Manage repositories</p>
                    <p className="text-xs text-muted-foreground">
                      Access your repos to push changes and create branches
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Streamline workflow</p>
                    <p className="text-xs text-muted-foreground">
                      Skip manual PR creation and focus on coding
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="text-destructive text-sm">{error}</div>
              </div>
            )}

            <DialogFooter className="gap-3 flex-col sm:flex-row">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Skip
              </Button>
              <Button
                onClick={handleLogin}
                disabled={fetching}
                className="flex-1"
              >
                <Github className="h-4 w-4 mr-2" />
                {fetching ? 'Starting…' : 'Sign in with GitHub'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
