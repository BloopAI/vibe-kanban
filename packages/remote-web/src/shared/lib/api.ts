import { getToken, triggerRefresh } from "@remote/shared/lib/auth/tokenManager";
import { clearTokens } from "@remote/shared/lib/auth";
import type { Project } from "shared/remote-types";
import type { ListOrganizationsResponse } from "shared/types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const AUTH_DEBUG_PREFIX = "[auth-debug][remote-web][api]";

function authDebug(message: string, data?: unknown): void {
  if (data === undefined) {
    console.debug(`${AUTH_DEBUG_PREFIX} ${message}`);
    return;
  }
  console.debug(`${AUTH_DEBUG_PREFIX} ${message}`, data);
}

function headersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

async function responseBodySnapshot(response: Response): Promise<string> {
  try {
    return await response.clone().text();
  } catch (error) {
    return `<<failed to read response body: ${String(error)}>>`;
  }
}

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
  authDebug("initOAuth request", { provider, returnTo, appChallenge });
  const res = await fetch(`${API_BASE}/v1/oauth/web/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      return_to: returnTo,
      app_challenge: appChallenge,
    }),
  });
  authDebug("initOAuth response metadata", {
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
    url: res.url,
    headers: headersToObject(res.headers),
  });
  authDebug("initOAuth response body", { body: await responseBodySnapshot(res) });
  if (!res.ok) {
    throw new Error(`OAuth init failed (${res.status})`);
  }
  const payload = await res.json();
  authDebug("initOAuth parsed response", payload);
  return payload;
}

export async function redeemOAuth(
  handoffId: string,
  appCode: string,
  appVerifier: string,
): Promise<HandoffRedeemResponse> {
  authDebug("redeemOAuth request", { handoffId, appCode, appVerifier });
  const res = await fetch(`${API_BASE}/v1/oauth/web/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handoff_id: handoffId,
      app_code: appCode,
      app_verifier: appVerifier,
    }),
  });
  authDebug("redeemOAuth response metadata", {
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
    url: res.url,
    headers: headersToObject(res.headers),
  });
  authDebug("redeemOAuth response body", { body: await responseBodySnapshot(res) });
  if (!res.ok) {
    throw new Error(`OAuth redeem failed (${res.status})`);
  }
  const payload = await res.json();
  authDebug("redeemOAuth parsed response", payload);
  return payload;
}

export async function getInvitation(
  token: string,
): Promise<InvitationLookupResponse> {
  authDebug("getInvitation request", { token });
  const res = await fetch(`${API_BASE}/v1/invitations/${token}`);
  authDebug("getInvitation response metadata", {
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
    url: res.url,
    headers: headersToObject(res.headers),
  });
  if (!res.ok) {
    authDebug("getInvitation response body", { body: await responseBodySnapshot(res) });
  }
  if (!res.ok) {
    throw new Error(`Invitation not found (${res.status})`);
  }
  const payload = await res.json();
  authDebug("getInvitation parsed response", payload);
  return payload;
}

export async function acceptInvitation(
  token: string,
  accessToken: string,
): Promise<AcceptInvitationResponse> {
  authDebug("acceptInvitation request", { token, accessToken });
  const res = await fetch(`${API_BASE}/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  authDebug("acceptInvitation response metadata", {
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
    url: res.url,
    headers: headersToObject(res.headers),
  });
  if (!res.ok) {
    authDebug("acceptInvitation response body", {
      body: await responseBodySnapshot(res),
    });
  }
  if (!res.ok) {
    throw new Error(`Failed to accept invitation (${res.status})`);
  }
  const payload = await res.json();
  authDebug("acceptInvitation parsed response", payload);
  return payload;
}

export async function refreshTokens(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string }> {
  authDebug("refreshTokens request", {
    endpoint: `${API_BASE}/v1/tokens/refresh`,
    refreshToken,
  });
  const res = await fetch(`${API_BASE}/v1/tokens/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  authDebug("refreshTokens response metadata", {
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
    url: res.url,
    headers: headersToObject(res.headers),
  });
  if (!res.ok) {
    const responseBody = await responseBodySnapshot(res);
    authDebug("refreshTokens response body (error)", { responseBody });
    const err = new Error(`Token refresh failed (${res.status})`);
    (
      err as Error & {
        status: number;
        responseBody?: string;
        responseHeaders?: Record<string, string>;
        responseUrl?: string;
      }
    ).status = res.status;
    (
      err as Error & {
        status: number;
        responseBody?: string;
        responseHeaders?: Record<string, string>;
        responseUrl?: string;
      }
    ).responseBody = responseBody;
    (
      err as Error & {
        status: number;
        responseBody?: string;
        responseHeaders?: Record<string, string>;
        responseUrl?: string;
      }
    ).responseHeaders = headersToObject(res.headers);
    (
      err as Error & {
        status: number;
        responseBody?: string;
        responseHeaders?: Record<string, string>;
        responseUrl?: string;
      }
    ).responseUrl = res.url;
    throw err;
  }
  const payload = await res.json();
  authDebug("refreshTokens parsed response", payload);
  return payload;
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  authDebug("authenticatedFetch called", { url, options });
  const accessToken = await getToken();
  authDebug("authenticatedFetch loaded access token", { accessToken });

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  authDebug("authenticatedFetch initial response metadata", {
    url,
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
    responseUrl: res.url,
    headers: headersToObject(res.headers),
  });
  if (!res.ok) {
    authDebug("authenticatedFetch initial response body", {
      body: await responseBodySnapshot(res),
    });
  }

  if (res.status === 401) {
    authDebug("authenticatedFetch got 401; triggering refresh");
    const newAccessToken = await triggerRefresh();
    authDebug("authenticatedFetch refresh returned token", { newAccessToken });
    const retryResponse = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${newAccessToken}`,
      },
    });
    authDebug("authenticatedFetch retry response metadata", {
      url,
      status: retryResponse.status,
      ok: retryResponse.ok,
      statusText: retryResponse.statusText,
      responseUrl: retryResponse.url,
      headers: headersToObject(retryResponse.headers),
    });
    if (!retryResponse.ok) {
      authDebug("authenticatedFetch retry response body", {
        body: await responseBodySnapshot(retryResponse),
      });
    }
    return retryResponse;
  }

  return res;
}

export async function logout(): Promise<void> {
  authDebug("logout called");
  try {
    await authenticatedFetch(`${API_BASE}/v1/oauth/logout`, {
      method: "POST",
    });
  } finally {
    authDebug("logout clearing local tokens");
    await clearTokens();
    authDebug("logout completed");
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
