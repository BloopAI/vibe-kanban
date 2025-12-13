import type { ReviewResult } from "../types/review";

const REVIEW_API_BASE = import.meta.env.DEV
  ? "/api/review"
  : import.meta.env.VITE_REVIEW_API_BASE_URL;

export async function getReview(reviewId: string): Promise<ReviewResult> {
  const res = await fetch(`${REVIEW_API_BASE}/${reviewId}`);
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
  const res = await fetch(`${REVIEW_API_BASE}/${reviewId}/file/${fileHash}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch file (${res.status})`);
  }
  return res.text();
}

export async function getDiff(reviewId: string): Promise<string> {
  const res = await fetch(`${REVIEW_API_BASE}/${reviewId}/diff`);
  if (!res.ok) {
    if (res.status === 404) {
      return "";
    }
    throw new Error(`Failed to fetch diff (${res.status})`);
  }
  return res.text();
}
