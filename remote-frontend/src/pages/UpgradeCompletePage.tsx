import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { redeemOAuth } from "../api";
import { storeTokens } from "../auth";
import { retrieveVerifier, clearVerifier } from "../pkce";

export default function UpgradeCompletePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/upgrade_/complete" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handoffId = search.handoff_id;
  const appCode = search.app_code;
  const oauthError = search.error;

  useEffect(() => {
    const completeLogin = async () => {
      if (oauthError) {
        setError(`OAuth error: ${oauthError}`);
        return;
      }

      if (!handoffId || !appCode) {
        return;
      }

      try {
        const verifier = retrieveVerifier();
        if (!verifier) {
          setError("OAuth session lost. Please try again.");
          return;
        }

        const { access_token, refresh_token } = await redeemOAuth(
          handoffId,
          appCode,
          verifier,
        );

        storeTokens(access_token, refresh_token);
        clearVerifier();

        setSuccess(true);

        // Redirect back to upgrade page after brief delay
        setTimeout(() => {
          navigate({ to: "/upgrade", replace: true });
        }, 1000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete login");
        clearVerifier();
      }
    };

    completeLogin();
  }, [handoffId, appCode, oauthError, navigate]);

  if (error) {
    return (
      <StatusCard
        title="Login failed"
        body={error}
        isError
        showRetry
        onRetry={() => navigate({ to: "/upgrade", replace: true })}
      />
    );
  }

  if (success) {
    return (
      <StatusCard
        title="Login successful!"
        body="Redirecting to complete your subscription..."
        isSuccess
      />
    );
  }

  return (
    <StatusCard
      title="Completing login..."
      body="Processing OAuth callback..."
    />
  );
}

function StatusCard({
  title,
  body,
  isError = false,
  isSuccess = false,
  showRetry = false,
  onRetry,
}: {
  title: string;
  body: string;
  isError?: boolean;
  isSuccess?: boolean;
  showRetry?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-6">
        <h2
          className={`text-lg font-semibold ${
            isError
              ? "text-red-600"
              : isSuccess
                ? "text-green-600"
                : "text-gray-900"
          }`}
        >
          {title}
        </h2>
        <p className="text-gray-600 mt-2">{body}</p>
        {isSuccess && (
          <div className="mt-4 flex items-center text-sm text-gray-500">
            <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Redirecting...
          </div>
        )}
        {showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
