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
import { LogIn, Github, Loader2, Chrome } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useState, useRef, useEffect } from 'react';
import { useAuthMutations } from '@/hooks/auth/useAuthMutations';
import { useAuthStatus } from '@/hooks/auth/useAuthStatus';
import { useUserSystem } from '@/components/ConfigProvider';
import type { ProfileResponse } from 'shared/types';
import { useTranslation } from 'react-i18next';
import { defineModal, type NoProps } from '@/lib/modals';

type OAuthProvider = 'github' | 'google';

type OAuthState =
  | { type: 'select' }
  | { type: 'waiting'; provider: OAuthProvider }
  | { type: 'success'; profile: ProfileResponse }
  | { type: 'error'; message: string };

const OAuthDialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const { t } = useTranslation('common');
  const { reloadSystem } = useUserSystem();
  const [state, setState] = useState<OAuthState>({ type: 'select' });
  const popupRef = useRef<Window | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Auth mutations hook
  const { initHandoff } = useAuthMutations({
    onInitSuccess: (data) => {
      // Open popup window with authorize URL
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      popupRef.current = window.open(
        data.authorize_url,
        'oauth-popup',
        `width=${width},height=${height},left=${left},top=${top},popup=yes,noopener=yes`
      );

      // Start polling
      setIsPolling(true);
    },
    onInitError: (error) => {
      setState({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to initialize OAuth flow',
      });
    },
  });

  // Poll for auth status using proper query hook
  const { data: statusData, isError: isStatusError } = useAuthStatus({
    enabled: isPolling,
  });

  // Handle status check errors
  useEffect(() => {
    if (isStatusError && isPolling) {
      setIsPolling(false);
      setState({
        type: 'error',
        message: 'Failed to check OAuth status',
      });
    }
  }, [isStatusError, isPolling]);

  // Monitor status changes
  useEffect(() => {
    if (!isPolling || !statusData) return;

    // Check if popup is closed
    if (popupRef.current?.closed) {
      setIsPolling(false);
      if (!statusData.logged_in) {
        setState({
          type: 'error',
          message: 'OAuth window was closed before completing authentication',
        });
      }
    }

    // If logged in, stop polling and trigger success
    if (statusData.logged_in && statusData.profile) {
      setIsPolling(false);
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }

      // Reload user system to refresh login status
      reloadSystem();

      setState({ type: 'success', profile: statusData.profile });
      setTimeout(() => {
        modal.resolve(statusData.profile);
        modal.hide();
      }, 1500);
    }
  }, [statusData, isPolling, modal, reloadSystem]);

  const handleProviderSelect = (provider: OAuthProvider) => {
    setState({ type: 'waiting', provider });

    // Get the current window location as return_to
    const returnTo = `${window.location.origin}/api/auth/handoff/complete`;

    // Initialize handoff flow
    initHandoff.mutate({ provider, returnTo });
  };

  const handleClose = () => {
    setIsPolling(false);
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    setState({ type: 'select' });
    modal.resolve(null);
    modal.hide();
  };

  const handleBack = () => {
    setIsPolling(false);
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    setState({ type: 'select' });
  };

  // Cleanup polling when dialog closes
  useEffect(() => {
    if (!modal.visible) {
      setIsPolling(false);
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
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
                <DialogTitle>{t('oauth.title')}</DialogTitle>
              </div>
              <DialogDescription className="text-left pt-2">
                {t('oauth.description')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <Button
                variant="outline"
                className="w-full h-12 flex items-center justify-center gap-3"
                onClick={() => handleProviderSelect('github')}
              >
                <Github className="h-5 w-5" />
                <span>{t('oauth.continueWithGitHub')}</span>
              </Button>

              <Button
                variant="outline"
                className="w-full h-12 flex items-center justify-center gap-3"
                onClick={() => handleProviderSelect('google')}
              >
                <Chrome className="h-5 w-5" />
                <span>{t('oauth.continueWithGoogle')}</span>
              </Button>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                {t('buttons.cancel')}
              </Button>
            </DialogFooter>
          </>
        );

      case 'waiting':
        return (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <LogIn className="h-6 w-6 text-primary-foreground" />
                <DialogTitle>{t('oauth.waitingTitle')}</DialogTitle>
              </div>
              <DialogDescription className="text-left pt-2">
                {t('oauth.waitingDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-6">
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{t('oauth.waitingForAuth')}</span>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                {t('oauth.popupInstructions')}
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleBack}>
                {t('oauth.back')}
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                {t('buttons.cancel')}
              </Button>
            </DialogFooter>
          </>
        );

      case 'success':
        return (
          <>
            <DialogHeader>
              <DialogTitle>{t('oauth.successTitle')}</DialogTitle>
              <DialogDescription className="text-left pt-2">
                {t('oauth.welcomeBack', {
                  name: state.profile.username || state.profile.email,
                })}
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
              <DialogTitle>{t('oauth.errorTitle')}</DialogTitle>
              <DialogDescription className="text-left pt-2">
                {t('oauth.errorDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleBack}>
                {t('oauth.tryAgain')}
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                {t('buttons.close')}
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

export const OAuthDialog = defineModal<void, ProfileResponse | null>(
  OAuthDialogImpl
);
