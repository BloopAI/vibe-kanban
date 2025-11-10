import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  LogIn,
  Github,
  Loader2,
  ExternalLink,
  Chrome,
  Copy,
  Check,
} from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useState, useRef, useEffect } from 'react';
import { oauthApi } from '@/lib/api';
import type { DeviceInitResponse, ProfileResponse } from 'shared/types';

type OAuthProvider = 'github' | 'google';

type OAuthState =
  | { type: 'select' }
  | { type: 'verifying'; data: DeviceInitResponse; provider: OAuthProvider }
  | { type: 'success'; profile: ProfileResponse }
  | { type: 'error'; message: string };

const OAuthDialog = NiceModal.create(() => {
  const modal = useModal();
  const [state, setState] = useState<OAuthState>({ type: 'select' });
  const [isPolling, setIsPolling] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleProviderSelect = async (provider: OAuthProvider) => {
    try {
      setState({ type: 'verifying', data: null as any, provider });
      const response = await oauthApi.deviceInit(provider);
      setState({ type: 'verifying', data: response, provider });

      // Start polling
      startPolling(response.handoff_id);
    } catch (error) {
      setState({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to initialize OAuth flow',
      });
    }
  };

  const startPolling = async (handoffId: string) => {
    setIsPolling(true);
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const result = await oauthApi.devicePoll(handoffId);

        if (result.status === 'success') {
          stopPolling();
          setState({ type: 'success', profile: result.profile });
          setTimeout(() => {
            modal.resolve(result.profile);
            modal.hide();
          }, 1500);
        } else if (result.status === 'error') {
          stopPolling();
          setState({
            type: 'error',
            message: `OAuth failed: ${result.code}`,
          });
        }
        // If pending, continue polling
      } catch (error) {
        stopPolling();
        setState({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to poll OAuth',
        });
      }
    }, 3000); // Poll every 3 seconds
  };

  const handleClose = () => {
    stopPolling();
    setState({ type: 'select' });
    setIsCopied(false);
    modal.resolve(null);
    modal.hide();
  };

  const handleBack = () => {
    setState({ type: 'select' });
    setIsPolling(false);
    setIsCopied(false);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  // Cleanup polling when dialog closes
  useEffect(() => {
    if (!modal.visible) {
      stopPolling();
    }
  }, [modal.visible]);

  const renderContent = () => {
    switch (state.type) {
      case 'select':
        return (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <LogIn className="h-6 w-6 text-primary-foreground" />
                <DialogTitle>Sign in with OAuth</DialogTitle>
              </div>
              <DialogDescription className="text-left pt-2">
                Connect your account using OAuth to access additional features
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <Button
                variant="outline"
                className="w-full h-12 flex items-center justify-center gap-3"
                onClick={() => handleProviderSelect('github')}
              >
                <Github className="h-5 w-5" />
                <span>Continue with GitHub</span>
              </Button>

              <Button
                variant="outline"
                className="w-full h-12 flex items-center justify-center gap-3"
                onClick={() => handleProviderSelect('google')}
              >
                <Chrome className="h-5 w-5" />
                <span>Continue with Google</span>
              </Button>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        );

      case 'verifying':
        return (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <LogIn className="h-6 w-6 text-primary-foreground" />
                <DialogTitle>Verify Your Identity</DialogTitle>
              </div>
              <DialogDescription className="text-left pt-2">
                Complete the authentication in your browser
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {state.data && (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Verification Code:</p>
                    <div className="relative">
                      <div
                        className="flex items-center justify-center w-full text-center text-2xl font-mono font-bold tracking-wider border rounded-md py-3 bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => handleCopyCode(state.data.user_code)}
                      >
                        <span>{state.data.user_code}</span>
                        <div className="absolute right-3">
                          {isCopied ? (
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      Click the button below to open your browser and enter the
                      verification code.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url =
                          state.data.verification_uri_complete ||
                          state.data.verification_uri;
                        window.open(url, '_blank');
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Browser
                    </Button>
                  </div>
                </>
              )}

              {isPolling && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Waiting for authentication...</span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        );

      case 'success':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Authentication Successful!</DialogTitle>
              <DialogDescription className="text-left pt-2">
                Welcome back, {state.profile.username || state.profile.email}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 flex items-center justify-center">
              <div className="text-green-500">
                <svg
                  className="h-16 w-16"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
          </>
        );

      case 'error':
        return (
          <>
            <DialogHeader>
              <DialogTitle>Authentication Failed</DialogTitle>
              <DialogDescription className="text-left pt-2">
                There was a problem authenticating your account
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleBack}>
                Try Again
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        );
    }
  };

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
});

export { OAuthDialog };
