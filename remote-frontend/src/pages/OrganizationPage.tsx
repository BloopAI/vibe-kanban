import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { isLoggedIn } from "../auth";
import {
  getOrganization,
  updateOrganization,
  deleteOrganization,
  listMembers,
  removeMember,
  updateMemberRole,
  listInvitations,
  createInvitation,
  revokeInvitation,
  getProfile,
  getGitHubAppStatus,
  getGitHubAppInstallUrl,
  disconnectGitHubApp,
  updateRepositoryReviewEnabled,
  fetchGitHubAppRepositories,
  bulkUpdateRepositoryReviewEnabled,
  type Organization,
  type OrganizationMemberWithProfile,
  type OrganizationInvitation,
  type MemberRole,
  type GitHubAppStatus,
  type GitHubAppRepository,
} from "../api";

export default function OrganizationPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [members, setMembers] = useState<OrganizationMemberWithProfile[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // GitHub App state
  const [githubAppStatus, setGithubAppStatus] = useState<GitHubAppStatus | null>(null);
  const [githubAppLoading, setGithubAppLoading] = useState(false);
  const [githubAppError, setGithubAppError] = useState<string | null>(null);
  const [showGithubDisconnectConfirm, setShowGithubDisconnectConfirm] = useState(false);
  const [githubAppSuccess, setGithubAppSuccess] = useState<string | null>(null);
  const [repoToggleLoading, setRepoToggleLoading] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<GitHubAppRepository[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [repoFilter, setRepoFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Edit name state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [editNameLoading, setEditNameLoading] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Invite state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("MEMBER");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isAdmin = userRole === "ADMIN";

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/account", { replace: true });
      return;
    }

    if (!orgId) return;
    loadData();

    // Check for GitHub App callback params
    const githubAppResult = searchParams.get("github_app");
    const githubAppErrorParam = searchParams.get("github_app_error");

    if (githubAppResult === "installed") {
      setGithubAppSuccess("GitHub App installed successfully!");
      // Clear the query param
      searchParams.delete("github_app");
      setSearchParams(searchParams, { replace: true });
    }

    if (githubAppErrorParam) {
      setGithubAppError(githubAppErrorParam);
      searchParams.delete("github_app_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [orgId, navigate, searchParams, setSearchParams]);

  async function loadData() {
    if (!orgId) return;

    try {
      const [orgData, membersData, profile] = await Promise.all([
        getOrganization(orgId),
        listMembers(orgId),
        getProfile(),
      ]);

      setOrganization(orgData.organization);
      setUserRole(orgData.user_role);
      setMembers(membersData);
      setCurrentUserId(profile.user_id);
      setEditedName(orgData.organization.name);

      // Load invitations if admin
      if (orgData.user_role === "ADMIN") {
        const invitationsData = await listInvitations(orgId);
        setInvitations(invitationsData.filter((i) => i.status === "PENDING"));
      }

      // Load GitHub App status for non-personal orgs
      if (!orgData.organization.is_personal) {
        try {
          const ghStatus = await getGitHubAppStatus(orgId);
          setGithubAppStatus(ghStatus);
          // If installed, load repos asynchronously
          if (ghStatus.installed) {
            loadRepositories(orgId);
          }
        } catch {
          // GitHub App may not be configured on the server
          setGithubAppStatus(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organization");
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !editedName.trim()) return;

    setEditNameLoading(true);
    setEditNameError(null);

    try {
      const updated = await updateOrganization(orgId, editedName.trim());
      setOrganization(updated);
      setIsEditingName(false);
    } catch (e) {
      setEditNameError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setEditNameLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!orgId) return;

    setDeleteLoading(true);

    try {
      await deleteOrganization(orgId);
      navigate("/account", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setShowDeleteConfirm(false);
      setDeleteLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!orgId) return;

    setActionLoading(userId);

    try {
      await removeMember(orgId, userId);
      setMembers(members.filter((m) => m.user_id !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: MemberRole) => {
    if (!orgId) return;

    setActionLoading(userId);

    try {
      await updateMemberRole(orgId, userId, newRole);
      setMembers(
        members.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;

    setInviteLoading(true);
    setInviteError(null);

    try {
      const invitation = await createInvitation(
        orgId,
        inviteEmail.trim(),
        inviteRole,
      );
      setInvitations([...invitations, invitation]);
      setInviteEmail("");
      setShowInviteForm(false);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!orgId) return;

    setActionLoading(invitationId);

    try {
      await revokeInvitation(orgId, invitationId);
      setInvitations(invitations.filter((i) => i.id !== invitationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke invitation");
    } finally {
      setActionLoading(null);
    }
  };

  const handleInstallGitHubApp = async () => {
    if (!orgId) return;

    setGithubAppLoading(true);
    setGithubAppError(null);

    try {
      const { install_url } = await getGitHubAppInstallUrl(orgId);
      // Redirect to GitHub to install the app
      window.location.href = install_url;
    } catch (e) {
      setGithubAppError(e instanceof Error ? e.message : "Failed to start installation");
      setGithubAppLoading(false);
    }
  };

  const handleDisconnectGitHubApp = async () => {
    if (!orgId) return;

    setGithubAppLoading(true);
    setGithubAppError(null);

    try {
      await disconnectGitHubApp(orgId);
      setGithubAppStatus({ installed: false, installation: null, repositories: [] });
      setShowGithubDisconnectConfirm(false);
      setGithubAppSuccess("GitHub App disconnected");
    } catch (e) {
      setGithubAppError(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setGithubAppLoading(false);
    }
  };

  const loadRepositories = async (organizationId: string) => {
    setReposLoading(true);
    try {
      const repos = await fetchGitHubAppRepositories(organizationId);
      setRepositories(repos);
    } catch (e) {
      setGithubAppError(e instanceof Error ? e.message : "Failed to load repositories");
    } finally {
      setReposLoading(false);
    }
  };

  const handleToggleRepoReview = async (repoId: string, enabled: boolean) => {
    if (!orgId) return;

    setRepoToggleLoading(repoId);

    try {
      const updatedRepo = await updateRepositoryReviewEnabled(orgId, repoId, enabled);
      setRepositories((prev) =>
        prev.map((r) =>
          r.id === repoId ? { ...r, review_enabled: updatedRepo.review_enabled } : r,
        ),
      );
    } catch (e) {
      setGithubAppError(e instanceof Error ? e.message : "Failed to update repository");
    } finally {
      setRepoToggleLoading(null);
    }
  };

  const handleBulkToggle = async (enabled: boolean) => {
    if (!orgId) return;

    setBulkLoading(true);
    try {
      await bulkUpdateRepositoryReviewEnabled(orgId, enabled);
      setRepositories((prev) =>
        prev.map((r) => ({ ...r, review_enabled: enabled })),
      );
    } catch (e) {
      setGithubAppError(e instanceof Error ? e.message : "Failed to update repositories");
    } finally {
      setBulkLoading(false);
    }
  };

  const filteredRepositories = repositories
    .filter((repo) =>
      repo.repo_full_name.toLowerCase().includes(repoSearch.toLowerCase()),
    )
    .filter((repo) => {
      if (repoFilter === "enabled") return repo.review_enabled;
      if (repoFilter === "disabled") return !repo.review_enabled;
      return true;
    })
    .sort((a, b) => a.repo_full_name.localeCompare(b.repo_full_name));

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error && !organization) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-600">Error</h2>
          <p className="text-gray-600 mt-2">{error}</p>
          <Link
            to="/account"
            className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900"
          >
            &larr; Back to account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back link */}
        <Link
          to="/account"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to account
        </Link>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-500 hover:text-red-700 mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Organization Details Card */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {isEditingName ? (
                <form onSubmit={handleUpdateName} className="space-y-2">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-lg font-bold"
                    autoFocus
                  />
                  {editNameError && (
                    <p className="text-sm text-red-600">{editNameError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={editNameLoading}
                      className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {editNameLoading ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingName(false);
                        setEditedName(organization?.name || "");
                        setEditNameError(null);
                      }}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900">
                    {organization?.name}
                  </h1>
                  {isAdmin && !organization?.is_personal && (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="text-gray-400 hover:text-gray-600"
                      title="Edit name"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}
              <p className="text-gray-600 mt-1">@{organization?.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              {organization?.is_personal && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                  Personal
                </span>
              )}
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  userRole === "ADMIN"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {userRole}
              </span>
            </div>
          </div>

          {/* Delete button (admin only, non-personal) */}
          {isAdmin && !organization?.is_personal && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              {showDeleteConfirm ? (
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-sm text-red-700 mb-3">
                    Are you sure you want to delete this organization? This
                    action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleteLoading}
                      className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteLoading ? "Deleting..." : "Yes, delete"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Delete organization
                </button>
              )}
            </div>
          )}
        </div>

        {/* Members Card */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Members</h2>
            {isAdmin && !organization?.is_personal && (
              <button
                onClick={() => setShowInviteForm(!showInviteForm)}
                className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                {showInviteForm ? "Cancel" : "Invite Member"}
              </button>
            )}
          </div>

          {/* Invite form */}
          {showInviteForm && (
            <form
              onSubmit={handleInvite}
              className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              {inviteError && (
                <p className="text-sm text-red-600">{inviteError}</p>
              )}
              <button
                type="submit"
                disabled={inviteLoading}
                className="w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviteLoading ? "Sending..." : "Send Invitation"}
              </button>
            </form>
          )}

          {/* Members list */}
          <div className="divide-y divide-gray-200">
            {members.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-xs text-gray-500">
                        {(member.first_name?.[0] || member.email?.[0] || "?").toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">
                      {member.first_name || member.username || member.email}
                      {member.user_id === currentUserId && (
                        <span className="text-gray-500 font-normal">
                          {" "}
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && !organization?.is_personal ? (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleUpdateRole(
                            member.user_id,
                            e.target.value as MemberRole,
                          )
                        }
                        disabled={
                          actionLoading === member.user_id ||
                          member.user_id === currentUserId
                        }
                        className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      {member.user_id !== currentUserId && (
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          disabled={actionLoading === member.user_id}
                          className="text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </>
                  ) : (
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        member.role === "ADMIN"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {member.role}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Invitations Card (admin only) */}
        {isAdmin && invitations.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Pending Invitations
            </h2>
            <div className="divide-y divide-gray-200">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {invitation.email}
                    </p>
                    <p className="text-sm text-gray-500">
                      Role: {invitation.role} &middot; Expires{" "}
                      {new Date(invitation.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevokeInvitation(invitation.id)}
                    disabled={actionLoading === invitation.id}
                    className="text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
                  >
                    {actionLoading === invitation.id ? "..." : "Revoke"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GitHub Integration Card (admin only, non-personal orgs) */}
        {isAdmin && !organization?.is_personal && githubAppStatus !== null && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              GitHub Integration
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Connect a GitHub App to automatically track pull requests from your repositories.
            </p>

            {/* Success message */}
            {githubAppSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">{githubAppSuccess}</p>
                <button
                  onClick={() => setGithubAppSuccess(null)}
                  className="text-xs text-green-600 hover:text-green-800 mt-1"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Error message */}
            {githubAppError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{githubAppError}</p>
                <button
                  onClick={() => setGithubAppError(null)}
                  className="text-xs text-red-600 hover:text-red-800 mt-1"
                >
                  Dismiss
                </button>
              </div>
            )}

            {githubAppStatus.installed && githubAppStatus.installation ? (
              // Installed state
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-gray-800"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <span className="font-medium text-gray-900">
                      @{githubAppStatus.installation.github_account_login}
                    </span>
                    {githubAppStatus.installation.suspended_at && (
                      <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                        Suspended
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                    Connected
                  </span>
                </div>

                {/* Repository section */}
                <div className="mb-4">
                  {reposLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                      Loading repositories...
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-gray-600 mb-3">
                        <p>
                          {repositories.filter((r) => r.review_enabled).length} of{" "}
                          {repositories.length}{" "}
                          {repositories.length === 1 ? "repository" : "repositories"}{" "}
                          have reviews enabled.
                        </p>
                      </div>

                      {repositories.length > 0 && (
                        <>
                          {/* Search, filter, and bulk actions */}
                          <div className="flex flex-col sm:flex-row gap-2 mb-3">
                            <input
                              type="text"
                              placeholder="Search repositories..."
                              value={repoSearch}
                              onChange={(e) => setRepoSearch(e.target.value)}
                              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
                            />
                            <select
                              value={repoFilter}
                              onChange={(e) => setRepoFilter(e.target.value as "all" | "enabled" | "disabled")}
                              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                            >
                              <option value="all">All</option>
                              <option value="enabled">Enabled</option>
                              <option value="disabled">Disabled</option>
                            </select>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleBulkToggle(true)}
                                disabled={bulkLoading}
                                className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
                              >
                                Enable All
                              </button>
                              <button
                                onClick={() => handleBulkToggle(false)}
                                disabled={bulkLoading}
                                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                              >
                                Disable All
                              </button>
                            </div>
                          </div>

                          {/* Repository list */}
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {filteredRepositories.length === 0 ? (
                              <p className="text-sm text-gray-500 py-2">
                                No repositories match "{repoSearch}"
                              </p>
                            ) : (
                              filteredRepositories.map((repo) => (
                                <div
                                  key={repo.id}
                                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                                >
                                  <span className="text-sm text-gray-700 truncate flex-1 mr-3">
                                    {repo.repo_full_name}
                                  </span>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={repo.review_enabled}
                                      onChange={(e) =>
                                        handleToggleRepoReview(repo.id, e.target.checked)
                                      }
                                      disabled={repoToggleLoading === repo.id || bulkLoading}
                                      className="sr-only peer"
                                    />
                                    <div
                                      className={`w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500 ${repoToggleLoading === repo.id || bulkLoading ? "opacity-50" : ""}`}
                                    ></div>
                                    <span className="ml-2 text-xs text-gray-500 whitespace-nowrap">
                                      {repo.review_enabled ? "On" : "Off"}
                                    </span>
                                  </label>
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Disconnect section */}
                {showGithubDisconnectConfirm ? (
                  <div className="bg-red-50 rounded-lg p-4">
                    <p className="text-sm text-red-700 mb-3">
                      Are you sure you want to disconnect the GitHub App? You will need
                      to reinstall it from GitHub to reconnect.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDisconnectGitHubApp}
                        disabled={githubAppLoading}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {githubAppLoading ? "Disconnecting..." : "Yes, disconnect"}
                      </button>
                      <button
                        onClick={() => setShowGithubDisconnectConfirm(false)}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowGithubDisconnectConfirm(true)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Disconnect GitHub App
                  </button>
                )}
              </div>
            ) : (
              // Not installed state
              <div>
                <button
                  onClick={handleInstallGitHubApp}
                  disabled={githubAppLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  {githubAppLoading ? "Loading..." : "Connect GitHub App"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
