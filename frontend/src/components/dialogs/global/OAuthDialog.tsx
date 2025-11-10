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
import { LogIn, Github, Loader2, ExternalLink, Chrome } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useState } from 'react';
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

  const handleProviderSelect = async (provider: OAuthProvider) => {
    try {
      setState({ type: 'verifying', data: null as any, provider });
      const response = await oauthApi.deviceInit(provider);
      setState({ type: 'verifying', data: response, provider });

      // Auto-open the verification URL
      if (response.verification_uri_complete) {
        window.open(response.verification_uri_complete, '_blank');
      } else {
        window.open(response.verification_uri, '_blank');
      }

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
    const pollInterval = setInterval(async () => {
      try {
        const result = await oauthApi.devicePoll(handoffId);

        if (result.status === 'success') {
          clearInterval(pollInterval);
          setIsPolling(false);
          setState({ type: 'success', profile: result.profile });
          setTimeout(() => {
            modal.resolve(result.profile);
            modal.hide();
          }, 1500);
        } else if (result.status === 'error') {
          clearInterval(pollInterval);
          setIsPolling(false);
          setState({
            type: 'error',
            message: `OAuth failed: ${result.code}`,
          });
        }
        // If pending, continue polling
      } catch (error) {
        clearInterval(pollInterval);
        setIsPolling(false);
        setState({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to poll OAuth',
        });
      }
    }, 3000); // Poll every 3 seconds
  };

  const handleClose = () => {
    modal.resolve(null);
    modal.hide();
  };

  const handleBack = () => {
    setState({ type: 'select' });
    setIsPolling(false);
  };

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
                    <input
                      type="text"
                      value={state.data.user_code}
                      readOnly
                      className="w-full text-center text-2xl font-mono font-bold tracking-wider border rounded-md py-3 bg-muted"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      A browser window has been opened. Enter the code above to
                      complete authentication.
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
                      Open Browser Again
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
