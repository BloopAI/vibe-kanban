import { useState } from "react";
import * as Sentry from "@sentry/react";

export default function SentryTestPage() {
  const [errorSent, setErrorSent] = useState(false);

  const sendTestError = () => {
    try {
      throw new Error("Test Sentry Error - This is a deliberate test error");
    } catch (error) {
      Sentry.captureException(error);
      setErrorSent(true);
    }
  };

  const triggerUnhandledError = () => {
    throw new Error("Unhandled Test Error - This will crash the page");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Sentry Test Page
        </h1>
        <p className="text-gray-600 mb-6">
          Use this page to test Sentry error reporting.
        </p>

        <div className="flex flex-col gap-4">
          <button
            onClick={sendTestError}
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Send Captured Error
          </button>

          <button
            onClick={triggerUnhandledError}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Trigger Unhandled Error
          </button>

          {errorSent && (
            <p className="text-sm text-green-600">Test error sent to Sentry!</p>
          )}
        </div>
      </div>
    </div>
  );
}
