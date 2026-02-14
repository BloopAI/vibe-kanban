import { jwtDecode } from 'jwt-decode';

type AccessTokenClaims = {
  exp: number;
  aud: string;
};

const TOKEN_REFRESH_LEEWAY_MS = 20_000;
const ACCESS_TOKEN_AUD = 'access';

const getTokenExpiryMs = (token: string): number | null => {
  try {
    const { exp, aud } = jwtDecode<AccessTokenClaims>(token);
    if (aud !== ACCESS_TOKEN_AUD) return null;
    if (!Number.isFinite(exp)) return null;
    return exp * 1000;
  } catch {
    return null;
  }
};

export const shouldRefreshAccessToken = (token: string): boolean => {
  const expiresAt = getTokenExpiryMs(token);
  if (expiresAt === null) return true;
  return expiresAt - Date.now() <= TOKEN_REFRESH_LEEWAY_MS;
};
