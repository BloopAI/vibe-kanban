import { getToken, triggerRefresh } from "@/shared/lib/auth/tokenManager";
import { clearTokens } from "@/shared/lib/auth";

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
