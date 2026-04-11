import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/KeyboardDialog';
import { Button } from '@vibe/ui/components/Button';
import { Input } from '@vibe/ui/components/Input';
import { Alert, AlertDescription } from '@vibe/ui/components/Alert';
import { LogIn, Loader2 } from 'lucide-react';
import { OAuthSignInButton } from '@vibe/ui/components/OAuthButtons';
import { create, useModal } from '@ebay/nice-modal-react';
import { useCallback, useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthMutations } from '@/shared/hooks/auth/useAuthMutations';
import { useAuthStatus } from '@/shared/hooks/auth/useAuthStatus';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { organizationKeys } from '@/shared/hooks/organizationKeys';
import { tokenManager } from '@/shared/lib/auth/tokenManager';
import { oauthApi, type AuthMethodsResponse } from '@/shared/lib/api';
import { useTranslation } from 'react-i18next';
import { defineModal } from '@/shared/lib/modals';

export type OAuthProvider = 'github' | 'google';
type OAuthDialogProps = { initialProvider?: OAuthProvider };

type OAuthState =
  | { type: 'select' }
  | { type: 'waiting'; provider: OAuthProvider }
  | { type: 'success'; displayName: string | null }
  | { type: 'error'; message: string };

const OAuthDialogImpl = create<OAuthDialogProps>(({ initialProvider }) => {
  const modal = useModal();
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const { reloadSystem } = useUserSystem();
  const [state, setState] = useState<OAuthState>({ type: 'select' });
  const popupRef = useRef<Window | null>(null);
  const autoStartedRef = useRef(false);
  const [isPolling, setIsPolling] = useState(false);
  const [localEmail, setLocalEmail] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const {
    data: authMethods,
    error: authMethodsError,
    isError: isAuthMethodsError,
    refetch: refetchAuthMethods,
  } = useQuery({
    queryKey: ['auth', 'methods'],
    queryFn: (): Promise<AuthMethodsResponse> => oauthApi.authMethods(),
    staleTime: 60_000,
  });
  const hasLocalAuth = authMethods?.local_auth_enabled ?? false;
  const oauthProviders = authMethods?.oauth_providers ?? [];
  const hasOAuthProviders = oauthProviders.length > 0;

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
    if (statusData.logged_in) {
      setIsPolling(false);
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }

      // Reload user system, then refresh token so paused Electric shapes
      // resume after re-authentication without requiring a full page reload.
      void (async () => {
        await reloadSystem();
        await tokenManager.triggerRefresh();
      })();

      // Invalidate organization caches to force fresh fetch after login
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });

      setState({
        type: 'success',
        displayName:
          statusData.profile?.username || statusData.profile?.email || null,
      });
      setTimeout(() => {
        modal.resolve(true);
        modal.remove();
      }, 1500);
    }
  }, [statusData, isPolling, modal, reloadSystem, queryClient]);

  const handleProviderSelect = useCallback(
    (provider: OAuthProvider) => {
      setState({ type: 'waiting', provider });

      // Get the current window location as return_to.
      // When running inside Tauri the OAuth flow opens in the system browser,
      // so we tag the callback URL so the server knows not to auto-close the tab.
      const isTauri = '__TAURI_INTERNALS__' in window;
      const returnTo = `${window.location.origin}/api/auth/handoff/complete${isTauri ? '?source=desktop' : ''}`;

      // Initialize handoff flow
      initHandoff.mutate({ provider, returnTo });
    },
    [initHandoff]
  );

  const handleClose = () => {
    setIsPolling(false);
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    setState({ type: 'select' });
    modal.resolve(null);
    modal.remove();
  };

  const handleBack = () => {
    setIsPolling(false);
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    setState({ type: 'select' });
  };

  const handleLocalLogin = useCallback(async () => {
    if (isSubmittingLocal) return;

    setIsSubmittingLocal(true);

    try {
      const profile = await oauthApi.localLogin(
        localEmail.trim(),
        localPassword
      );
      await reloadSystem();
      await tokenManager.triggerRefresh();
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });

      setState({
        type: 'success',
        displayName: profile.username || profile.email || null,
      });
      setTimeout(() => {
        modal.resolve(true);
        modal.remove();
      }, 800);
    } catch (error) {
      setState({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to sign in',
      });
    } finally {
      setIsSubmittingLocal(false);
    }
  }, [
    isSubmittingLocal,
    localEmail,
    localPassword,
    modal,
    queryClient,
    reloadSystem,
  ]);

  // Cleanup polling when dialog closes
  useEffect(() => {
    if (!modal.visible) {
      autoStartedRef.current = false;
      setIsPolling(false);
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    }
  }, [modal.visible]);

  // Auto-start OAuth if a provider was preselected
  useEffect(() => {
    if (!modal.visible || !initialProvider) return;
    if (state.type !== 'select') return;
    if (autoStartedRef.current) return;

    autoStartedRef.current = true;
    handleProviderSelect(initialProvider);
  }, [handleProviderSelect, initialProvider, modal.visible, state.type]);

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
              {isAuthMethodsError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {authMethodsError instanceof Error
                      ? authMethodsError.message
                      : 'Failed to load available sign-in methods.'}
                  </AlertDescription>
                </Alert>
              )}
              {isAuthMethodsError && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void refetchAuthMethods()}
                >
                  Retry
                </Button>
              )}
              {!isAuthMethodsError && hasLocalAuth && (
                <>
                  <Input
                    id="local-auth-email"
                    type="email"
                    value={localEmail}
                    onChange={(event) => setLocalEmail(event.target.value)}
                    placeholder="Email"
                    autoComplete="username"
                  />
                  <Input
                    id="local-auth-password"
                    type="password"
                    value={localPassword}
                    onChange={(event) => setLocalPassword(event.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="relative flex h-10 w-full items-center overflow-hidden rounded-[4px] border border-[#dadce0] bg-[#f2f2f2] px-3 text-[14px] font-medium leading-5 tracking-[0.25px] text-[#1f1f1f] transition-colors duration-150 hover:bg-[#e8eaed] active:bg-[#e2e3e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40 disabled:cursor-not-allowed disabled:bg-[#ffffff61] disabled:text-[#1f1f1f]/40"
                    onClick={() => void handleLocalLogin()}
                    disabled={
                      isSubmittingLocal || !localEmail.trim() || !localPassword
                    }
                    style={{ fontFamily: "'Roboto', Arial, sans-serif" }}
                  >
                    <span className="w-full text-center">
                      {isSubmittingLocal
                        ? 'Signing in...'
                        : 'Sign in with email'}
                    </span>
                  </button>
                </>
              )}
              {!isAuthMethodsError &&
                hasOAuthProviders &&
                oauthProviders.includes('github') && (
                  <OAuthSignInButton
                    provider="github"
                    className="w-full"
                    onClick={() => handleProviderSelect('github')}
                    disabled={isSubmittingLocal}
                  />
                )}
              {!isAuthMethodsError &&
                hasOAuthProviders &&
                oauthProviders.includes('google') && (
                  <OAuthSignInButton
                    provider="google"
                    className="w-full"
                    onClick={() => handleProviderSelect('google')}
                    disabled={isSubmittingLocal}
                  />
                )}
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
              {state.displayName ? (
                <DialogDescription className="text-left pt-2">
                  {t('oauth.welcomeBack', {
                    name: state.displayName,
                  })}
                </DialogDescription>
              ) : null}
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

export const OAuthDialog = defineModal<OAuthDialogProps, boolean | null>(
  OAuthDialogImpl
);
