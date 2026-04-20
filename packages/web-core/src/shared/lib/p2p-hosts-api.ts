import { handleApiResponse } from '@/shared/lib/api';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import type {
  P2pHost,
  SshPairRequest,
  SshPairResponse,
  UpdateSshConfigRequest,
} from '@/shared/types/p2p-hosts';

// Local-only request helper that bypasses host-scoping (hostScope: 'none')
// so P2P management endpoints always hit the local backend.
const makeP2pRequest = (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return makeLocalApiRequest(url, { ...options, headers, hostScope: 'none' });
};

export const p2pHostsApi = {
  async listHosts(): Promise<P2pHost[]> {
    const response = await makeP2pRequest('/api/p2p/hosts');
    return handleApiResponse<P2pHost[]>(response);
  },

  async getHost(id: string): Promise<P2pHost> {
    const response = await makeP2pRequest(`/api/p2p/hosts/${id}`);
    return handleApiResponse<P2pHost>(response);
  },

  async removeHost(id: string): Promise<void> {
    const response = await makeP2pRequest(`/api/p2p/hosts/${id}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  async generateEnrollmentCode(): Promise<{
    code: string;
    expires_at: string;
  }> {
    const response = await makeP2pRequest('/api/p2p/enrollment-code', {
      method: 'POST',
    });
    return handleApiResponse<{ code: string; expires_at: string }>(response);
  },

  async completePairing(request: {
    code: string;
    name: string;
    address: string;
  }): Promise<P2pHost> {
    const response = await makeP2pRequest('/api/p2p/pair', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return handleApiResponse<P2pHost>(response);
  },

  async sshPair(request: SshPairRequest): Promise<SshPairResponse> {
    const response = await makeP2pRequest('/api/p2p/ssh-pair', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return handleApiResponse<SshPairResponse>(response);
  },

  async updateSshConfig(
    id: string,
    request: UpdateSshConfigRequest
  ): Promise<P2pHost> {
    const response = await makeP2pRequest(`/api/p2p/hosts/${id}/ssh-config`, {
      method: 'PUT',
      body: JSON.stringify(request),
    });
    return handleApiResponse<P2pHost>(response);
  },
};
