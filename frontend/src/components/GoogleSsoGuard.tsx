import { ReactNode } from 'react';
import { useUserSystem } from './ConfigProvider';
import { GoogleSsoLogin } from './GoogleSsoLogin';
import { useGoogleSsoSession } from '@/hooks/auth/useGoogleSsoSession';
import { Loader } from './ui/loader';

interface GoogleSsoGuardProps {
  children: ReactNode;
}

/**
 * Guards the application content behind Google SSO authentication.
 *
 * - If SSO is not enabled, children are rendered immediately.
 * - If SSO is enabled and user is authenticated, children are rendered.
 * - If SSO is enabled and user is not authenticated, login page is shown.
 */
export function GoogleSsoGuard({ children }: GoogleSsoGuardProps) {
  const { system, loading: systemLoading } = useUserSystem();
  const ssoEnabled = system?.google_sso_config?.enabled ?? false;
  const { data: session, isLoading: sessionLoading } =
    useGoogleSsoSession(ssoEnabled);

  // SSO not enabled - pass through immediately
  if (!ssoEnabled) {
    return <>{children}</>;
  }

  // Still loading system config or session
  if (systemLoading || sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader message="Checking authentication..." size={32} />
      </div>
    );
  }

  // Not authenticated - show login
  if (!session?.authenticated) {
    return <GoogleSsoLogin />;
  }

  // Authenticated - render app
  return <>{children}</>;
}
