import { oauthApi } from '../api';

const baseUrl =
  import.meta.env.VITE_VK_SHARED_API_BASE || 'http://localhost:3000';

export const createAuthenticatedShapeOptions = (table: string) => ({
  url: `${baseUrl}/v1/shape/${table}`,
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
