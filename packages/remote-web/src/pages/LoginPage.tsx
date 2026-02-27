import { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { initOAuth, type OAuthProvider } from "@remote/shared/lib/api";
import { BrandLogo } from "@remote/shared/components/BrandLogo";
import {
  generateVerifier,
  generateChallenge,
  storeVerifier,
} from "@remote/shared/lib/pkce";

export default function LoginPage() {
  const { next } = useSearch({ from: "/account" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const handleLogin = async (provider: OAuthProvider) => {
    setPending(provider);
    setError(null);

    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);
      storeVerifier(verifier);

      const appBase =
        import.meta.env.VITE_APP_BASE_URL || window.location.origin;
      const callbackUrl = new URL("/account/complete", appBase);
      if (next) {
        callbackUrl.searchParams.set("next", next);
      }
      const returnTo = callbackUrl.toString();

      const { authorize_url } = await initOAuth(provider, returnTo, challenge);
      window.location.assign(authorize_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth init failed");
      setPending(null);
    }
  };

  return (
    <div className="h-screen overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-base py-double">
        <div className="space-y-double rounded-sm border border-border bg-secondary p-double">
          <header className="space-y-double text-center">
            <div className="flex justify-center">
              <BrandLogo className="h-8 w-auto" />
            </div>
            <p className="text-sm text-low">Sign in to continue</p>
          </header>

          {error && (
            <div className="rounded-sm border border-error/30 bg-error/10 p-base">
              <p className="text-sm text-high">{error}</p>
            </div>
          )}

          <section className="flex flex-col items-center gap-2">
            <OAuthButton
              provider="github"
              label="Continue with GitHub"
              onClick={() => void handleLogin("github")}
              disabled={pending !== null}
              loading={pending === "github"}
            />
            <OAuthButton
              provider="google"
              label="Continue with Google"
              onClick={() => void handleLogin("google")}
              disabled={pending !== null}
              loading={pending === "google"}
            />
          </section>

          <p className="text-center text-sm text-low">
            Need help getting started?{" "}
            <a
              href="https://www.vibekanban.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-normal underline decoration-border underline-offset-4 transition-colors hover:text-high"
            >
              Read the docs
            </a>
          </p>
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
