import { useState } from 'react';
import * as Sentry from '@sentry/react';

export function SentryTest() {
  const [errorSent, setErrorSent] = useState(false);

  const sendTestError = () => {
    try {
      throw new Error('Test Sentry Error - This is a deliberate test error');
    } catch (error) {
      Sentry.captureException(error);
      setErrorSent(true);
    }
  };

  const triggerUnhandledError = () => {
    throw new Error('Unhandled Test Error - This will be caught by ErrorBoundary');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Sentry Test Page</h1>
      <p className="text-muted-foreground mb-6">
        Use this page to test Sentry error reporting.
      </p>

      <div className="flex flex-col gap-4 max-w-md">
        <button
          onClick={sendTestError}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Send Captured Error
        </button>

        <button
          onClick={triggerUnhandledError}
          className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
        >
          Trigger Unhandled Error
        </button>

        {errorSent && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Test error sent to Sentry!
          </p>
        )}
      </div>
    </div>
  );
}
