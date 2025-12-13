import type { ReviewResult } from "./types/review";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

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
