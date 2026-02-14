import type { ReviewResult } from "./types/review";
import { clearTokens } from "./auth";
import { getToken, triggerRefresh } from "./tokenManager";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Types for account management
export type MemberRole = "ADMIN" | "MEMBER";

export type ProviderProfile = {
  provider: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type ProfileResponse = {
  user_id: string;
  username: string | null;
  email: string;
  providers: ProviderProfile[];
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  created_at: string;
  updated_at: string;
};

export type OrganizationWithRole = Organization & {
  user_role: MemberRole;
};

export type OrganizationMemberWithProfile = {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

export type OrganizationInvitation = {
  id: string;
  organization_id: string;
  invited_by_user_id: string | null;
  email: string;
  role: MemberRole;
  status: InvitationStatus;
  token: string;
  created_at: string;
  expires_at: string;
};

export type CreateOrganizationRequest = {
  name: string;
  slug: string;
};

export type GetOrganizationResponse = {
  organization: Organization;
  user_role: string;
};

export type Invitation = {
  id: string;
  organization_slug: string;
  organization_name: string;
  role: string;
  expires_at: string;
};

export type OAuthProvider = "github" | "google";

export type HandoffInitResponse = {
  handoff_id: string;
  authorize_url: string;
};

export type HandoffRedeemResponse = {
  access_token: string;
  refresh_token: string;
};

export type AcceptInvitationResponse = {
  organization_id: string;
  organization_slug: string;
  role: string;
};

export async function getInvitation(token: string): Promise<Invitation> {
  const res = await fetch(`${API_BASE}/v1/invitations/${token}`);
  if (!res.ok) {
    throw new Error(`Invitation not found (${res.status})`);
  }
  return res.json();
}

export async function initOAuth(
  provider: OAuthProvider,
  returnTo: string,
  appChallenge: string,
): Promise<HandoffInitResponse> {
  const res = await fetch(`${API_BASE}/v1/oauth/web/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      return_to: returnTo,
      app_challenge: appChallenge,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth init failed (${res.status})`);
  }
  return res.json();
}

export async function redeemOAuth(
  handoffId: string,
  appCode: string,
  appVerifier: string,
): Promise<HandoffRedeemResponse> {
  const res = await fetch(`${API_BASE}/v1/oauth/web/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handoff_id: handoffId,
      app_code: appCode,
      app_verifier: appVerifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth redeem failed (${res.status})`);
  }
  return res.json();
}

export async function acceptInvitation(
  token: string,
  accessToken: string,
): Promise<AcceptInvitationResponse> {
  const res = await fetch(`${API_BASE}/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to accept invitation (${res.status})`);
  }
  return res.json();
}

export async function getReview(reviewId: string): Promise<ReviewResult> {
  const res = await fetch(`${API_BASE}/v1/review/${reviewId}`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Review not found");
    }
    throw new Error(`Failed to fetch review (${res.status})`);
  }
  return res.json();
}

export async function getFileContent(
  reviewId: string,
  fileHash: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/review/${reviewId}/file/${fileHash}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch file (${res.status})`);
  }
  return res.text();
}

export async function getDiff(reviewId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/review/${reviewId}/diff`);
  if (!res.ok) {
    if (res.status === 404) {
      return "";
    }
    throw new Error(`Failed to fetch diff (${res.status})`);
  }
  return res.text();
}

export interface ReviewMetadata {
  gh_pr_url: string;
  pr_title: string;
}

export async function getReviewMetadata(
  reviewId: string,
): Promise<ReviewMetadata> {
  const res = await fetch(`${API_BASE}/v1/review/${reviewId}/metadata`);
  if (!res.ok) {
    throw new Error(`Failed to fetch review metadata (${res.status})`);
  }
  return res.json();
}

export async function refreshTokens(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(`${API_BASE}/v1/tokens/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw new ApiError(`Token refresh failed (${res.status})`, res.status);
  }
  return res.json();
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const accessToken = await getToken();

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    const newAccessToken = await triggerRefresh();
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${newAccessToken}`,
      },
    });
  }

  return res;
}

// Profile APIs
export async function getProfile(): Promise<ProfileResponse> {
  const res = await authenticatedFetch(`${API_BASE}/v1/profile`);
  if (!res.ok) {
    throw new Error(`Failed to fetch profile (${res.status})`);
  }
  return res.json();
}

export async function logout(): Promise<void> {
  try {
    await authenticatedFetch(`${API_BASE}/v1/oauth/logout`, {
      method: "POST",
    });
  } finally {
    clearTokens();
  }
}

// Organization APIs
export async function listOrganizations(): Promise<OrganizationWithRole[]> {
  const res = await authenticatedFetch(`${API_BASE}/v1/organizations`);
  if (!res.ok) {
    throw new Error(`Failed to fetch organizations (${res.status})`);
  }
  const data = await res.json();
  return data.organizations;
}

export async function createOrganization(
  data: CreateOrganizationRequest,
): Promise<OrganizationWithRole> {
  const res = await authenticatedFetch(`${API_BASE}/v1/organizations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to create organization (${res.status})`,
    );
  }
  const result = await res.json();
  return result.organization;
}

export async function getOrganization(
  orgId: string,
): Promise<GetOrganizationResponse> {
  const res = await authenticatedFetch(`${API_BASE}/v1/organizations/${orgId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch organization (${res.status})`);
  }
  return res.json();
}

export async function updateOrganization(
  orgId: string,
  name: string,
): Promise<Organization> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to update organization (${res.status})`,
    );
  }
  return res.json();
}

export async function deleteOrganization(orgId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to delete organization (${res.status})`,
    );
  }
}

// Organization Members APIs
export async function listMembers(
  orgId: string,
): Promise<OrganizationMemberWithProfile[]> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/members`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch members (${res.status})`);
  }
  const data = await res.json();
  return data.members;
}

export async function removeMember(
  orgId: string,
  userId: string,
): Promise<void> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/members/${userId}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `Failed to remove member (${res.status})`);
  }
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/members/${userId}/role`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to update member role (${res.status})`,
    );
  }
}

// Invitation APIs
export async function listInvitations(
  orgId: string,
): Promise<OrganizationInvitation[]> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/invitations`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch invitations (${res.status})`);
  }
  const data = await res.json();
  return data.invitations;
}

export async function createInvitation(
  orgId: string,
  email: string,
  role: MemberRole,
): Promise<OrganizationInvitation> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/invitations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(
      error.message || `Failed to create invitation (${res.status})`,
      res.status,
    );
  }
  const data = await res.json();
  return data.invitation;
}

export async function revokeInvitation(
  orgId: string,
  invitationId: string,
): Promise<void> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/invitations/revoke`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitation_id: invitationId }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to revoke invitation (${res.status})`,
    );
  }
}

// GitHub App Integration Types
export type GitHubAppInstallation = {
  id: string;
  github_installation_id: number;
  github_account_login: string;
  github_account_type: "Organization" | "User";
  repository_selection: "all" | "selected";
  suspended_at: string | null;
  created_at: string;
};

export type GitHubAppRepository = {
  id: string;
  github_repo_id: number;
  repo_full_name: string;
  review_enabled: boolean;
};

export type GitHubAppStatus = {
  installed: boolean;
  installation: GitHubAppInstallation | null;
  repositories: GitHubAppRepository[];
};

export type GitHubAppInstallUrlResponse = {
  install_url: string;
};

// GitHub App Integration APIs
export async function getGitHubAppInstallUrl(
  orgId: string,
): Promise<GitHubAppInstallUrlResponse> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/github-app/install-url`,
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Failed to get install URL (${res.status})`);
  }
  return res.json();
}

export async function getGitHubAppStatus(
  orgId: string,
): Promise<GitHubAppStatus> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/github-app/status`,
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to get GitHub App status (${res.status})`,
    );
  }
  return res.json();
}

export async function disconnectGitHubApp(orgId: string): Promise<void> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/github-app`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to disconnect GitHub App (${res.status})`,
    );
  }
}

export async function updateRepositoryReviewEnabled(
  orgId: string,
  repoId: string,
  enabled: boolean,
): Promise<GitHubAppRepository> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/github-app/repositories/${repoId}/review-enabled`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to update repository (${res.status})`,
    );
  }
  return res.json();
}

export async function fetchGitHubAppRepositories(
  orgId: string,
): Promise<GitHubAppRepository[]> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/github-app/repositories`,
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to fetch repositories (${res.status})`,
    );
  }
  return res.json();
}

export async function bulkUpdateRepositoryReviewEnabled(
  orgId: string,
  enabled: boolean,
): Promise<{ updated_count: number }> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/github-app/repositories/review-enabled`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to update repositories (${res.status})`,
    );
  }
  return res.json();
}

export type BillingStatus =
  | "free"
  | "active"
  | "past_due"
  | "cancelled"
  | "requires_subscription";

export type SubscriptionInfo = {
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  quantity: number;
  unit_amount: number;
};

export type SeatInfo = {
  current_members: number;
  free_seats: number;
  requires_subscription: boolean;
  subscription: SubscriptionInfo | null;
};

export type BillingStatusResponse = {
  status: BillingStatus;
  billing_enabled: boolean;
  seat_info: SeatInfo | null;
};

export async function getBillingStatus(
  orgId: string,
): Promise<BillingStatusResponse> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/billing`,
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to fetch billing status (${res.status})`,
    );
  }
  return res.json();
}

export async function createBillingPortalSession(
  orgId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/billing/portal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ return_url: returnUrl }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to create portal session (${res.status})`,
    );
  }
  return res.json();
}

export async function createCheckoutSession(
  orgId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string }> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${orgId}/billing/checkout`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success_url: successUrl, cancel_url: cancelUrl }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || `Failed to create checkout session (${res.status})`,
    );
  }
  return res.json();
}
