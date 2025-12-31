import { GoogleLogin } from '@react-oauth/google';
import { useState } from 'react';
import { googleSsoApi } from '@/lib/api';

interface GoogleSsoLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

/**
 * Full-page Google SSO login component.
 * Shows a centered login button and handles the authentication flow.
 */
export function GoogleSsoLogin({ onSuccess, onError }: GoogleSsoLoginProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      setError('No credential received from Google');
      onError?.('No credential received from Google');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await googleSsoApi.verify(credentialResponse.credential);
      // Reload the page to refresh auth state
      window.location.reload();
      onSuccess?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to verify with server';
      setError(message);
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleError = () => {
    setError('Google Sign-In failed. Please try again.');
    onError?.('Google Sign-In failed');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Sign in to continue
          </h1>
          <p className="text-sm text-muted-foreground">
            Authentication is required to access this application
          </p>
        </div>

        {error && (
          <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Signing in...</span>
          </div>
        ) : (
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            useOneTap={false}
            theme="filled_blue"
            size="large"
            text="signin_with"
            shape="rectangular"
          />
        )}
      </div>
    </div>
  );
}
