export function generateVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

export async function generateChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

const VERIFIER_KEY = 'oauth_verifier'
const TOKEN_KEY = 'invitation_token'

export function storeVerifier(verifier: string): void {
  sessionStorage.setItem(VERIFIER_KEY, verifier)
}

export function retrieveVerifier(): string | null {
  return sessionStorage.getItem(VERIFIER_KEY)
}

export function clearVerifier(): void {
  sessionStorage.removeItem(VERIFIER_KEY)
}

export function storeInvitationToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function retrieveInvitationToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function clearInvitationToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}
