import { oauthApi } from '../api';

export const createAuthenticatedShapeOptions = (table: string) => ({
  url: `${window.location.origin}/v1/shape/${table}`,
  headers: {
    Authorization: async () => {
      const tokenResponse = await oauthApi.getToken();
      return tokenResponse ? `Bearer ${tokenResponse.access_token}` : '';
    },
  },
  parser: {
    timestamptz: (value: string) => value,
  },
});
