import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { OrganizationWithRole } from "shared/types";
import { useAuth } from "@/shared/hooks/auth/useAuth";
import { BrandLogo } from "@remote/shared/components/BrandLogo";
import {
  createCheckoutSession,
  initOAuth,
  listOrganizations,
  type OAuthProvider,
} from "@remote/shared/lib/api";
import {
  generateChallenge,
  generateVerifier,
  storeVerifier,
} from "@remote/shared/lib/pkce";

const UPGRADE_ORG_KEY = "upgrade_org_id";
const UPGRADE_RETURN_KEY = "upgrade_return";

type Step = "plan-selection" | "sign-in" | "org-selection";

export default function UpgradePage() {
  const search = useSearch({ from: "/upgrade" });
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useAuth();

  const [step, setStep] = useState<Step>("plan-selection");
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>(
    [],
  );
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizations = useCallback(async () => {
    setLoadingOrganizations(true);
    setError(null);

    try {
      const { organizations: orgs } = await listOrganizations();
      const eligibleOrgs = orgs.filter(
        (org) => !org.is_personal && org.user_role === "ADMIN",
      );
      setOrganizations(eligibleOrgs);

      const savedOrgId = localStorage.getItem(UPGRADE_ORG_KEY);
      const preferredOrgId = search.org_id ?? savedOrgId;
      const preferredOrg = preferredOrgId
        ? eligibleOrgs.find((org) => org.id === preferredOrgId)
        : null;

      if (preferredOrg) {
        setSelectedOrgId(preferredOrg.id);
      } else {
        setSelectedOrgId(eligibleOrgs[0]?.id ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organizations");
    } finally {
      setLoadingOrganizations(false);
    }
  }, [search.org_id]);

  useEffect(() => {
    if (search.org_id) {
      localStorage.setItem(UPGRADE_ORG_KEY, search.org_id);
      setSelectedOrgId(search.org_id);
    }
  }, [search.org_id]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    const isReturningFromUpgradeLogin =
      sessionStorage.getItem(UPGRADE_RETURN_KEY) === "true";
    if (!isReturningFromUpgradeLogin) {
      return;
    }

    sessionStorage.removeItem(UPGRADE_RETURN_KEY);
    setStep("org-selection");
    void loadOrganizations();
  }, [isLoaded, isSignedIn, loadOrganizations]);

  const handleSubscribe = async () => {
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      setStep("org-selection");
      await loadOrganizations();
      return;
    }

    setStep("sign-in");
  };

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setOauthLoading(provider);
    setError(null);

    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);
      storeVerifier(verifier);

      sessionStorage.setItem(UPGRADE_RETURN_KEY, "true");

      const appBase =
        import.meta.env.VITE_APP_BASE_URL || window.location.origin;
      const returnTo = `${appBase}/upgrade/complete`;
      const { authorize_url } = await initOAuth(provider, returnTo, challenge);

      window.location.assign(authorize_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth init failed");
      setOauthLoading(null);
    }
  };

  const handleCheckout = async () => {
    if (!selectedOrgId) {
      return;
    }

    setCheckoutLoading(true);
    setError(null);

    try {
      localStorage.setItem(UPGRADE_ORG_KEY, selectedOrgId);

      const appBase =
        import.meta.env.VITE_APP_BASE_URL || window.location.origin;
      const { url } = await createCheckoutSession(
        selectedOrgId,
        `${appBase}/upgrade/success`,
        `${appBase}/upgrade?org_id=${selectedOrgId}`,
      );

      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start checkout");
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center px-base py-double">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-double space-y-base text-center">
            <div className="flex justify-center">
              <BrandLogo className="h-8 w-auto" />
            </div>
            <h1 className="text-xl font-semibold text-high">
              Choose Your Plan
            </h1>
            <p className="text-sm text-low">
              Pick the plan that fits your team and continue to checkout.
            </p>
          </header>

          {error && (
            <div className="mx-auto mb-double w-full max-w-xl rounded-sm border border-error/40 bg-error/10 p-base">
              <p className="text-sm text-high">{error}</p>
              <button
                type="button"
                className="mt-half text-xs text-normal hover:text-high"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {step === "plan-selection" && (
            <div className="grid gap-base md:grid-cols-3">
              <PlanCard
                name="Basic"
                price="Free"
                description="For individual users"
                features={[
                  "1 user included",
                  "Core features",
                  "Community support",
                ]}
              />
              <PlanCard
                name="Pro"
                price="$30"
                priceUnit="/user/month"
                description="For teams of 2-49"
                features={[
                  "2-49 users",
                  "All Basic features",
                  "99.5% SLA",
                  "Discord support",
                ]}
                popular
                cta="Subscribe"
                onCta={() => {
                  void handleSubscribe();
                }}
              />
              <PlanCard
                name="Enterprise"
                price="Custom"
                description="For large organizations"
                features={[
                  "50+ users",
                  "All Pro features",
                  "SSO / SAML",
                  "99.9% SLA",
                  "Dedicated Slack channel",
                ]}
                cta="Contact Sales"
                onCta={() => {
                  window.location.assign(
                    "mailto:louis@bloop.ai?subject=Enterprise%20Plan%20Inquiry",
                  );
                }}
              />
            </div>
          )}

          {step === "sign-in" && (
            <div className="mx-auto w-full max-w-lg">
              <div className="rounded-sm border border-border bg-secondary p-double">
                <h2 className="text-lg font-semibold text-high">Sign In</h2>
                <p className="mt-half text-sm text-low">
                  Sign in to continue with your subscription.
                </p>

                <div className="mt-double flex flex-col items-center gap-2">
                  <OAuthButton
                    label="Continue with GitHub"
                    onClick={() => {
                      void handleOAuthLogin("github");
                    }}
                    disabled={oauthLoading !== null}
                    loading={oauthLoading === "github"}
                  />
                  <OAuthButton
                    label="Continue with Google"
                    onClick={() => {
                      void handleOAuthLogin("google");
                    }}
                    disabled={oauthLoading !== null}
                    loading={oauthLoading === "google"}
                  />
                </div>

                <button
                  type="button"
                  className="mt-double w-full rounded-sm border border-border bg-primary px-base py-half text-sm text-normal hover:text-high"
                  onClick={() => setStep("plan-selection")}
                >
                  Back to plans
                </button>
              </div>
            </div>
          )}

          {step === "org-selection" && (
            <div className="mx-auto w-full max-w-lg">
              <div className="rounded-sm border border-border bg-secondary p-double">
                <h2 className="text-lg font-semibold text-high">
                  Select Organization
                </h2>
                <p className="mt-half text-sm text-low">
                  Choose the organization you want to upgrade.
                </p>

                {loadingOrganizations ? (
                  <p className="mt-double text-sm text-normal">
                    Loading organizations...
                  </p>
                ) : organizations.length === 0 ? (
                  <>
                    <p className="mt-double text-sm text-normal">
                      No eligible organizations found. You need admin access to
                      a non-personal organization to upgrade.
                    </p>
                    <button
                      type="button"
                      className="mt-double w-full rounded-sm bg-brand px-base py-half text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
                      onClick={() => navigate({ to: "/" })}
                    >
                      Go to Organizations
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mt-double space-y-half">
                      {organizations.map((organization) => (
                        <label
                          key={organization.id}
                          className={`block cursor-pointer rounded-sm border p-base transition-colors ${
                            selectedOrgId === organization.id
                              ? "border-brand bg-panel"
                              : "border-border bg-primary hover:border-high"
                          }`}
                        >
                          <div className="flex items-center gap-base">
                            <input
                              type="radio"
                              name="organization"
                              value={organization.id}
                              checked={selectedOrgId === organization.id}
                              onChange={() => setSelectedOrgId(organization.id)}
                            />
                            <div>
                              <p className="text-sm font-medium text-high">
                                {organization.name}
                              </p>
                              <p className="text-xs text-low">
                                @{organization.slug}
                              </p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="mt-double w-full rounded-sm bg-brand px-base py-half text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        void handleCheckout();
                      }}
                      disabled={!selectedOrgId || checkoutLoading}
                    >
                      {checkoutLoading
                        ? "Redirecting..."
                        : "Continue to Checkout"}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="mt-base w-full rounded-sm border border-border bg-primary px-base py-half text-sm text-normal hover:text-high"
                  onClick={() => setStep("plan-selection")}
                >
                  Back to plans
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  priceUnit,
  description,
  features,
  popular,
  cta,
  onCta,
}: {
  name: string;
  price: string;
  priceUnit?: string;
  description: string;
  features: string[];
  popular?: boolean;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div
      className={`rounded-sm border bg-secondary p-double ${
        popular ? "border-brand" : "border-border"
      }`}
    >
      <div className="mb-base text-center">
        <h2 className="text-lg font-semibold text-high">{name}</h2>
        <p className="mt-half text-xl font-semibold text-high">
          {price}
          {priceUnit && (
            <span className="ml-half text-sm text-low">{priceUnit}</span>
          )}
        </p>
        <p className="mt-half text-sm text-low">{description}</p>
      </div>

      <ul className="space-y-half">
        {features.map((feature, index) => (
          <li key={`${feature}-${index}`} className="text-sm text-normal">
            {feature}
          </li>
        ))}
      </ul>

      {cta && onCta ? (
        <button
          type="button"
          className={`mt-double w-full rounded-sm px-base py-half text-sm font-medium transition-colors ${
            popular
              ? "bg-brand text-on-brand hover:bg-brand-hover"
              : "bg-primary text-high hover:bg-panel"
          }`}
          onClick={onCta}
        >
          {cta}
        </button>
      ) : (
        <div className="mt-double w-full rounded-sm border border-border bg-primary px-base py-half text-center text-sm text-low">
          Current plan
        </div>
      )}
    </div>
  );
}

function OAuthButton({
  label,
  onClick,
  disabled,
  loading,
}: {
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
      {loading ? "Opening provider..." : label}
    </button>
  );
}
