import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocalAuth } from '@/contexts/LocalAuthContext';

export function Login() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, isLocalAuthConfigured, login } = useLocalAuth();
  const navigate = useNavigate();

  // Redirect to home if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleGitHubLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  // If local auth is not configured, show a message
  if (!isLocalAuthConfigured) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full px-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {t('localAuth.appName')}
            </h1>
            <p className="text-muted-foreground">
              {t('localAuth.tagline')}
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <div className="text-center">
              <div className="text-amber-500 mb-4">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-medium text-foreground mb-2">
                {t('localAuth.notConfiguredTitle')}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t('localAuth.notConfiguredDescription')}
              </p>
              <ul className="text-sm text-left text-muted-foreground bg-muted rounded-md p-3 font-mono">
                <li>GITHUB_CLIENT_ID</li>
                <li>GITHUB_CLIENT_SECRET</li>
                <li>SESSION_SECRET</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-4">
                {t('localAuth.seeDocumentation')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md w-full px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {t('localAuth.appName')}
          </h1>
          <p className="text-muted-foreground">
            {t('localAuth.tagline')}
          </p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <h2 className="text-lg font-medium text-foreground mb-4 text-center">
            {t('localAuth.signInToContinue')}
          </h2>

          <button
            onClick={handleGitHubLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#24292f] hover:bg-[#2f363d] text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="h-5 w-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
            {isLoading ? t('states.loading') : t('localAuth.continueWithGitHub')}
          </button>

          <p className="text-xs text-muted-foreground text-center mt-4">
            {t('localAuth.privacyNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
