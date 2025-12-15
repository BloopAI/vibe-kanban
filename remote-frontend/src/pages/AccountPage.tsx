import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isLoggedIn } from "../auth";
import {
  initOAuth,
  getProfile,
  logout,
  listOrganizations,
  createOrganization,
  type OAuthProvider,
  type ProfileResponse,
  type OrganizationWithRole,
} from "../api";
import {
  generateVerifier,
  generateChallenge,
  storeVerifier,
} from "../pkce";

export default function AccountPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  // Create org form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn()) {
      setAuthenticated(true);
      loadData();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadData() {
    try {
      const [profileData, orgsData] = await Promise.all([
        getProfile(),
        listOrganizations(),
      ]);
      setProfile(profileData);
      setOrganizations(orgsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setOauthLoading(true);
    try {
      const verifier = generateVerifier();
      const challenge = await generateChallenge(verifier);
      storeVerifier(verifier);

      const appBase =
        import.meta.env.VITE_APP_BASE_URL || window.location.origin;
      const returnTo = `${appBase}/account/complete`;

      const result = await initOAuth(provider, returnTo, challenge);
      window.location.assign(result.authorize_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OAuth init failed");
      setOauthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setAuthenticated(false);
      setProfile(null);
      setOrganizations([]);
    } catch (e) {
      // Tokens already cleared in logout()
      setAuthenticated(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    try {
      const org = await createOrganization({
        name: newOrgName.trim(),
        slug: newOrgSlug.trim().toLowerCase(),
      });
      navigate(`/account/organizations/${org.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreateLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 63);
  };

  if (loading) {
    return <LoadingCard text="Loading..." />;
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white shadow rounded-lg p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sign In</h1>
            <p className="text-gray-600 mt-1">
              Sign in to manage your account and organizations
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <OAuthButton
              label="Continue with GitHub"
              onClick={() => handleOAuthLogin("github")}
              disabled={oauthLoading}
            />
            <OAuthButton
              label="Continue with Google"
              onClick={() => handleOAuthLogin("google")}
              disabled={oauthLoading}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile Card */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              {profile?.providers[0]?.avatar_url && (
                <img
                  src={profile.providers[0].avatar_url}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full"
                />
              )}
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {profile?.providers[0]?.display_name ||
                    profile?.username ||
                    "User"}
                </h1>
                <p className="text-gray-600">{profile?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign out
            </button>
          </div>

          {profile && profile.providers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Connected accounts:</p>
              <div className="flex flex-wrap gap-2">
                {profile.providers.map((p) => (
                  <span
                    key={p.provider}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                  >
                    {p.provider}
                    {p.username && ` (${p.username})`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Organizations Card */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Organizations
            </h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              {showCreateForm ? "Cancel" : "New Organization"}
            </button>
          </div>

          {showCreateForm && (
            <form
              onSubmit={handleCreateOrg}
              className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => {
                    setNewOrgName(e.target.value);
                    if (!newOrgSlug || newOrgSlug === generateSlug(newOrgName)) {
                      setNewOrgSlug(generateSlug(e.target.value));
                    }
                  }}
                  placeholder="My Organization"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase())}
                  placeholder="my-organization"
                  pattern="[a-z0-9\-_]+"
                  minLength={3}
                  maxLength={63}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only lowercase letters, numbers, hyphens, and underscores
                </p>
              </div>
              {createError && (
                <p className="text-sm text-red-600">{createError}</p>
              )}
              <button
                type="submit"
                disabled={createLoading}
                className="w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createLoading ? "Creating..." : "Create Organization"}
              </button>
            </form>
          )}

          {organizations.length === 0 ? (
            <p className="text-gray-600 text-sm">
              You don't belong to any organizations yet.
            </p>
          ) : (
            <div className="divide-y divide-gray-200">
              {organizations.map((org) => (
                <Link
                  key={org.id}
                  to={`/account/organizations/${org.id}`}
                  className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">{org.name}</p>
                    <p className="text-sm text-gray-500">@{org.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {org.is_personal && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        Personal
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        org.user_role === "ADMIN"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {org.user_role}
                    </span>
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OAuthButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-gray-50">
      <div className="text-gray-600">{text}</div>
    </div>
  );
}
