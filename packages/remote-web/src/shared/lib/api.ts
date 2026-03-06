import { getToken, triggerRefresh } from "@remote/shared/lib/auth/tokenManager";
import { clearTokens } from "@remote/shared/lib/auth";
import type { Project } from "shared/remote-types";
import type { ListOrganizationsResponse } from "shared/types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export type OAuthProvider = "github" | "google";

type HandoffInitResponse = {
  handoff_id: string;
  authorize_url: string;
};

type HandoffRedeemResponse = {
  access_token: string;
  refresh_token: string;
};

export type InvitationLookupResponse = {
  id: string;
  organization_slug: string;
  organization_name?: string;
  role: string;
  expires_at: string;
};

type AcceptInvitationResponse = {
  organization_id: string;
  organization_slug: string;
  role: string;
};

type IdentityResponse = {
  user_id: string;
  username: string | null;
  email: string;
};

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

export async function getInvitation(
  token: string,
): Promise<InvitationLookupResponse> {
  const res = await fetch(`${API_BASE}/v1/invitations/${token}`);
  if (!res.ok) {
    throw new Error(`Invitation not found (${res.status})`);
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

export async function refreshTokens(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(`${API_BASE}/v1/tokens/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const err = new Error(`Token refresh failed (${res.status})`);
    (err as Error & { status: number }).status = res.status;
    throw err;
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

export async function logout(): Promise<void> {
  try {
    await authenticatedFetch(`${API_BASE}/v1/oauth/logout`, {
      method: "POST",
    });
  } finally {
    await clearTokens();
  }
}

export async function listOrganizations(): Promise<ListOrganizationsResponse> {
  const res = await authenticatedFetch(`${API_BASE}/v1/organizations`);
  if (!res.ok) {
    throw new Error(`Failed to list organizations (${res.status})`);
  }
  return res.json();
}

export async function getIdentity(): Promise<IdentityResponse> {
  const res = await authenticatedFetch(`${API_BASE}/v1/identity`);
  if (!res.ok) {
    throw new Error(`Failed to fetch identity (${res.status})`);
  }
  return res.json();
}

export async function listOrganizationProjects(
  organizationId: string,
): Promise<Project[]> {
  const params = new URLSearchParams({
    organization_id: organizationId,
  });

  const res = await authenticatedFetch(`${API_BASE}/v1/projects?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to list projects (${res.status})`);
  }

  const body = (await res.json()) as { projects: Project[] };
  return body.projects;
}

export async function createCheckoutSession(
  organizationId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string }> {
  const res = await authenticatedFetch(
    `${API_BASE}/v1/organizations/${organizationId}/billing/checkout`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to create checkout session (${res.status})`);
  }

  return res.json();
}
