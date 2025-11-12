const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export type Invitation = {
  id: string
  organization_slug: string
  organization_name: string
  role: string
  expires_at: string
}

export async function getInvitation(token: string): Promise<Invitation> {
  const res = await fetch(`${API_BASE}/invitations/${token}`)
  if (!res.ok) {
    throw new Error(`Invitation not found (${res.status})`)
  }
  return res.json()
}

export function buildAcceptUrl(
  token: string,
  provider: 'github' | 'google'
): string {
  const appBase = import.meta.env.VITE_APP_BASE_URL || window.location.origin
  const returnTo = encodeURIComponent(
    `${appBase}/invitations/${token}/complete`
  )
  const base = `${API_BASE}/invitations/${token}/accept`
  return `${base}?provider=${provider}&return_to=${returnTo}`
}
