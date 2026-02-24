import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { redeemOAuth } from "@remote/shared/lib/api";
import { storeTokens } from "@remote/shared/lib/auth";
import { clearVerifier, retrieveVerifier } from "@remote/shared/lib/pkce";

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

        await storeTokens(access_token, refresh_token);
        clearVerifier();
        setSuccess(true);

        setTimeout(() => {
          window.location.replace("/upgrade");
        }, 700);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete login");
        clearVerifier();
      }
    };

    void completeLogin();
  }, [handoffId, appCode, oauthError]);

  if (error) {
    return (
      <StatusCard title="Login failed" variant="error">
        <p className="mt-base text-sm text-normal">{error}</p>
        <button
          type="button"
          className="mt-double w-full rounded-sm bg-brand px-base py-half text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
          onClick={() => navigate({ to: "/upgrade", replace: true })}
        >
          Try again
        </button>
      </StatusCard>
    );
  }

  if (success) {
    return (
      <StatusCard title="Login successful">
        <p className="mt-base text-sm text-normal">
          Redirecting to complete your subscription...
        </p>
      </StatusCard>
    );
  }

  return (
    <StatusCard title="Completing login...">
      <p className="mt-base text-sm text-low">Processing OAuth callback...</p>
    </StatusCard>
  );
}

function StatusCard({
  title,
  variant,
  children,
}: {
  title: string;
  variant?: "error";
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-base py-double">
        <div className="rounded-sm border border-border bg-secondary p-double">
          <h2
            className={`text-lg font-semibold ${
              variant === "error" ? "text-error" : "text-high"
            }`}
          >
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );
}
