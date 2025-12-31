import { GoogleOAuthProvider } from '@react-oauth/google';
import { ReactNode } from 'react';
import { useUserSystem } from './ConfigProvider';

interface GoogleSsoProviderProps {
  children: ReactNode;
}

/**
 * Wraps the application with GoogleOAuthProvider when SSO is configured.
 * If no client ID is provided, children are rendered without the provider.
 */
export function GoogleSsoProvider({ children }: GoogleSsoProviderProps) {
  const { system } = useUserSystem();
  const clientId = system?.google_sso_config?.client_id;

  // If no client ID configured, just render children
  if (!clientId) {
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
  );
}
