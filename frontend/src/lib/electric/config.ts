import { oauthApi } from '../api';
import { REMOTE_API_URL } from '@/lib/remoteApi';

export const createAuthenticatedShapeOptions = (table: string) => ({
  url: `${REMOTE_API_URL}/v1/shape/${table}`,
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
