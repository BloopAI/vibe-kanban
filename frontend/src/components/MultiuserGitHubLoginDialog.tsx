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
import { Check, Clipboard, Github, LogOut, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useAuth } from './auth-provider';
import { multiuserAuthApi } from '../lib/api';
import type { DeviceStartResponse } from 'shared/types';


export function MultiuserGitHubLoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, isAuthenticated, login, logout } = useAuth();
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceState, setDeviceState] = useState<null | DeviceStartResponse>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLogin = async () => {
    setFetching(true);
    setError(null);
    setDeviceState(null);
    try {
      const data = await multiuserAuthApi.start();
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
          const jwt = await multiuserAuthApi.poll(deviceState.device_code);
          login(jwt); // Login with JWT token
          setPolling(false);
          setDeviceState(null);
          setError(null);
          onOpenChange(false);
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
  }, [polling, deviceState, login, onOpenChange]);

  // Automatically copy code to clipboard when deviceState is set
  useEffect(() => {
    if (deviceState?.user_code) {
      copyToClipboard(deviceState.user_code);
    }
  }, [deviceState?.user_code]);

  // Auto-close dialog when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && open) {
      console.log('User authenticated, closing login dialog');
      onOpenChange(false);
    }
  }, [isAuthenticated, open, onOpenChange]);

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

  const handleLogout = () => {
    logout();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Github className="h-6 w-6 text-primary" />
            <DialogTitle>Team Authentication</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-1">
            Sign in with GitHub to join your team and get assigned tasks with proper attribution.
          </DialogDescription>
        </DialogHeader>
        
        {isAuthenticated && user ? (
          <div className="space-y-4 py-3">
            <Card>
              <CardContent className="text-center py-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Check className="h-8 w-8 text-green-500" />
                  <User className="h-8 w-8 text-gray-600" />
                </div>
                <div className="text-lg font-medium text-gray-900 mb-1">
                  Welcome, {user.username}!
                </div>
                <div className="text-sm text-muted-foreground">
                  You are signed in with team access
                </div>
              </CardContent>
            </Card>
            <DialogFooter className="gap-3 flex-col sm:flex-row">
              <Button variant="outline" onClick={handleLogout} className="flex-1">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
              <Button onClick={() => onOpenChange(false)} className="flex-1">
                Continue
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
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-600 text-sm">{error}</div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Why team authentication?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Get assigned tasks</p>
                    <p className="text-xs text-muted-foreground">
                      Team members can assign tasks to you directly
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Proper git attribution</p>
                    <p className="text-xs text-muted-foreground">
                      All commits and PRs will be properly attributed to you
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Team collaboration</p>
                    <p className="text-xs text-muted-foreground">
                      Enable seamless collaboration with your development team
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-600 text-sm">{error}</div>
              </div>
            )}

            <DialogFooter className="gap-3 flex-col sm:flex-row">
              <Button
                onClick={handleLogin}
                disabled={fetching}
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