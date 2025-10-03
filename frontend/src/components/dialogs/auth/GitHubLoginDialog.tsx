import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { useUserSystem } from '@/components/config-provider';
import { Check, Clipboard, Github } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { githubAuthApi } from '@/lib/api';
import { DeviceFlowStartResponse, DevicePollStatus } from 'shared/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

const GitHubLoginDialog = NiceModal.create(() => {
  const modal = useModal();
  const { config, loading, githubTokenInvalid, reloadSystem } = useUserSystem();
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
              setError(null);
              await reloadSystem();
              modal.resolve(true);
              modal.hide();
              setDeviceState(null);
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

  // Automatically copy code to clipboard and open GitHub URL when deviceState is set
  useEffect(() => {
    if (deviceState?.user_code) {
      copyToClipboard(deviceState.user_code);
    }
  }, [deviceState?.user_code, deviceState?.verification_uri]);

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
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) {
          modal.resolve(isAuthenticated ? true : false);
          modal.hide();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Github className="h-6 w-6" />
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
              <Button
                onClick={() => {
                  modal.resolve(true);
                  modal.hide();
                }}
                className="w-full"
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : deviceState ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-10 h-10 bg-background border rounded-full flex items-center justify-center text-lg font-semibold">
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
                  className="text-sm underline"
                >
                  {deviceState.verification_uri}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-10 h-10 bg-background border rounded-full flex items-center justify-center text-lg font-semibold">
                2
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium mb-3">Enter this code:</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono font-bold tracking-[0.2em] bg-muted border flex h-9 px-2 items-center">
                    <span>{deviceState.user_code}</span>
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

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
              <Github className="h-3 w-3 flex-shrink-0" />
              <span>
                {copied
                  ? 'Code copied to clipboard! Complete the authorization on GitHub.'
                  : 'Waiting for you to authorize this application on GitHub...'}
              </span>
            </div>

            {error && <Alert variant="destructive">{error}</Alert>}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  modal.resolve(false);
                  modal.hide();
                }}
              >
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

            {error && <Alert variant="destructive">{error}</Alert>}

            <DialogFooter className="gap-3 flex-col sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  modal.resolve(false);
                  modal.hide();
                }}
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
});

export { GitHubLoginDialog };
