import { useEffect, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { acceptInvitation, redeemOAuth } from "@remote/shared/lib/api";
import { storeTokens } from "@remote/shared/lib/auth";
import {
  clearInvitationToken,
  clearVerifier,
  retrieveInvitationToken,
  retrieveVerifier,
} from "@remote/shared/lib/pkce";

export default function InvitationCompletePage() {
  const { token: urlToken } = useParams({
    from: "/invitations/$token/complete",
  });
  const search = useSearch({ from: "/invitations/$token/complete" });
  const [error, setError] = useState<string | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);

  const handoffId = search.handoff_id;
  const appCode = search.app_code;
  const oauthError = search.error;

  useEffect(() => {
    const completeInvitation = async () => {
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

        const token = retrieveInvitationToken() || urlToken;
        if (!token) {
          setError("Invitation token lost. Please try again.");
          return;
        }

        const { access_token, refresh_token } = await redeemOAuth(
          handoffId,
          appCode,
          verifier,
        );

        await storeTokens(access_token, refresh_token);
        await acceptInvitation(token, access_token);

        clearVerifier();
        clearInvitationToken();

        setIsAccepted(true);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to complete invitation",
        );
        clearVerifier();
        clearInvitationToken();
      }
    };

    void completeInvitation();
  }, [handoffId, appCode, oauthError, urlToken]);

  if (error) {
    const retryPath = urlToken ? `/invitations/${urlToken}/accept` : "/account";

    return (
      <StatusCard title="Could not accept invitation" variant="error">
        <p className="mt-base text-sm text-normal">{error}</p>
        <button
          type="button"
          className="mt-double w-full rounded-sm bg-brand px-base py-half text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
          onClick={() => {
            window.location.assign(retryPath);
          }}
        >
          Try again
        </button>
      </StatusCard>
    );
  }

  if (isAccepted) {
    return (
      <StatusCard title="Invitation accepted!">
        <p className="mt-base text-sm text-normal">
          Your invitation is confirmed. You can now close this page.
        </p>
        <a
          href="https://www.vibekanban.com/docs/getting-started"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-double block w-full rounded-sm bg-brand px-base py-half text-center text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
        >
          Get started
        </a>
      </StatusCard>
    );
  }

  return (
    <StatusCard title="Completing invitation...">
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
            className={`text-lg font-semibold ${variant === "error" ? "text-error" : "text-high"}`}
          >
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );
}
