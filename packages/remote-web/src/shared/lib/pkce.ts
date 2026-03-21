function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function generateVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

export async function generateChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);

  // Compatible with HTTP environments (crypto.subtle is unavailable in insecure contexts)
  // Only allow fallback in development environment (import.meta.env.DEV) when crypto.subtle is indeed unavailable
  if (crypto.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return bytesToHex(new Uint8Array(hash));
  } else if (import.meta.env.DEV) {
    // Fallback: use crypto-js SHA256 (for development/testing only)
    console.warn("crypto.subtle unavailable, using fallback. Please use HTTPS in production");
    // Ensure the hash matches the server's expected SHA-256
    // Dynamic import to avoid bloating the production bundle with crypto-js
    const CryptoJS = (await import('crypto-js')).default;
    const hash = CryptoJS.SHA256(verifier);
    return hash.toString(CryptoJS.enc.Hex);
  } else {
    // If not in dev and subtle is missing, fail fast
    throw new Error("crypto.subtle is required for PKCE but is unavailable. Ensure you are using HTTPS.");
  }
}

const VERIFIER_KEY = "oauth_verifier";
const INVITATION_TOKEN_KEY = "invitation_token";

export function storeVerifier(verifier: string): void {
  sessionStorage.setItem(VERIFIER_KEY, verifier);
}

export function retrieveVerifier(): string | null {
  return sessionStorage.getItem(VERIFIER_KEY);
}

export function clearVerifier(): void {
  sessionStorage.removeItem(VERIFIER_KEY);
}

export function storeInvitationToken(token: string): void {
  sessionStorage.setItem(INVITATION_TOKEN_KEY, token);
}

export function retrieveInvitationToken(): string | null {
  return sessionStorage.getItem(INVITATION_TOKEN_KEY);
}

export function clearInvitationToken(): void {
  sessionStorage.removeItem(INVITATION_TOKEN_KEY);
}
