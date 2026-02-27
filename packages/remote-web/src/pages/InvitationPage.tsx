import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import {
  getInvitation,
  initOAuth,
  type InvitationLookupResponse,
  type OAuthProvider,
} from "@remote/shared/lib/api";
import {
  generateChallenge,
  generateVerifier,
  storeInvitationToken,
  storeVerifier,
} from "@remote/shared/lib/pkce";

export default function InvitationPage() {
  const { token } = useParams({ from: "/invitations/$token/accept" });
  const [invitation, setInvitation] = useState<InvitationLookupResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    const loadInvitation = async () => {
      setError(null);
      setInvitation(null);

      try {
        const response = await getInvitation(token);
        if (!cancelled) {
          setInvitation(response);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load invitation",
          );
        }
      }
    };

    void loadInvitation();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setPendingProvider(provider);
    setError(null);

    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);

      storeVerifier(verifier);
      storeInvitationToken(token);

      const appBase =
        import.meta.env.VITE_APP_BASE_URL || window.location.origin;
      const callbackUrl = new URL(`/invitations/${token}/complete`, appBase);

      const { authorize_url } = await initOAuth(
        provider,
        callbackUrl.toString(),
        challenge,
      );
      window.location.assign(authorize_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth init failed");
      setPendingProvider(null);
    }
  };

  if (error && !invitation) {
    return (
      <StatusCard title="Invalid or expired invitation" variant="error">
        <p className="mt-base text-sm text-normal">{error}</p>
      </StatusCard>
    );
  }

  if (!invitation) {
    return (
      <StatusCard title="Loading invitation...">
        <p className="mt-base text-sm text-low">Please wait.</p>
      </StatusCard>
    );
  }

  return (
    <div className="h-screen overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-base py-double">
        <div className="space-y-double rounded-sm border border-border bg-secondary p-double">
          <header className="space-y-half text-center">
            <h1 className="text-2xl font-semibold text-high">
              You&apos;re invited
            </h1>
            <p className="text-sm text-low">
              You&apos;ve been invited to join{" "}
              <span className="font-medium text-high">
                {invitation.organization_name ?? invitation.organization_slug}
              </span>{" "}
              on Vibe Kanban.
            </p>
          </header>

          <section className="mx-auto w-full max-w-xs space-y-half border-t border-border pt-base text-sm">
            <div className="flex items-center justify-between gap-base">
              <span className="text-low">Role</span>
              <span className="font-medium text-high">{invitation.role}</span>
            </div>
            <div className="flex items-center justify-between gap-base">
              <span className="text-low">Expires</span>
              <span className="font-medium text-high">
                {new Date(invitation.expires_at).toLocaleDateString()}
              </span>
            </div>
          </section>

          {error && (
            <div className="rounded-sm border border-error/30 bg-error/10 p-base">
              <p className="text-sm text-high">{error}</p>
            </div>
          )}

          <section className="space-y-base border-t border-border pt-base text-center">
            <p className="text-sm text-low">Choose a provider to continue:</p>
            <div className="flex flex-col items-center gap-2">
              <OAuthButton
                provider="github"
                label="Continue with GitHub"
                onClick={() => void handleOAuthLogin("github")}
                disabled={pendingProvider !== null}
                loading={pendingProvider === "github"}
              />
              <OAuthButton
                provider="google"
                label="Continue with Google"
                onClick={() => void handleOAuthLogin("google")}
                disabled={pendingProvider !== null}
                loading={pendingProvider === "google"}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function OAuthButton({
  provider,
  label,
  onClick,
  disabled,
  loading,
}: {
  provider: OAuthProvider;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex h-10 min-w-[280px] items-center justify-center rounded-[4px] border border-[#dadce0] bg-[#f2f2f2] px-3 text-[14px] font-medium text-[#1f1f1f] transition-colors hover:bg-[#e8eaed] active:bg-[#e2e3e5] disabled:cursor-not-allowed disabled:opacity-50"
      style={{ fontFamily: "'Roboto', Arial, sans-serif" }}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading
        ? `Opening ${provider === "github" ? "GitHub" : "Google"}...`
        : label}
    </button>
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
