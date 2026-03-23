import type {
  Config,
  GetMcpServerResponse,
  GitBranch,
  InstalledAcpServer,
  McpServerQuery,
  Repo,
  UpdateMcpServersBody,
  UpdateRepo,
  UserSystemInfo,
} from 'shared/types';
import type { RegistryEntryWithStatus } from './api';
import type { AppRuntime } from '@/shared/hooks/useAppRuntime';
import { handleApiResponse } from './api';
import {
  makeLocalApiRequest,
  type LocalApiRequestOptions,
} from './localApiTransport';

export type MachineTarget =
  | {
      kind: 'local';
      id: 'local';
      apiHostId: null;
      label: string;
    }
  | {
      kind: 'remote';
      id: string;
      apiHostId: string;
      label: string;
    };

export interface MachineClient {
  target: MachineTarget;
  queryScopeKey: readonly ['machine', string];
  getConfig: () => Promise<UserSystemInfo>;
  saveConfig: (config: Config) => Promise<Config>;
  listRepos: () => Promise<Repo[]>;
  updateRepo: (repoId: string, data: UpdateRepo) => Promise<Repo>;
  deleteRepo: (repoId: string) => Promise<void>;
  registerRepo: (data: {
    path: string;
    display_name?: string;
  }) => Promise<Repo>;
  getRepoBranches: (repoId: string) => Promise<GitBranch[]>;
  loadProfiles: () => Promise<{ content: string; path: string }>;
  saveProfiles: (content: string) => Promise<string>;
  loadMcpServers: (query: McpServerQuery) => Promise<GetMcpServerResponse>;
  saveMcpServers: (
    query: McpServerQuery,
    data: UpdateMcpServersBody
  ) => Promise<void>;
  listAcpServers: () => Promise<InstalledAcpServer[]>;
  getAcpRegistry: () => Promise<RegistryEntryWithStatus[]>;
  installAcpFromRegistry: (registryId: string) => Promise<{ name: string }>;
  installAcpCustom: (name: string) => Promise<string>;
  uninstallAcpServer: (name: string) => Promise<string>;
  getExecutorSchema: (executor: string) => Promise<Record<string, unknown>>;
}

function getMachineRequestOptions(
  runtime: AppRuntime,
  target: MachineTarget
): LocalApiRequestOptions {
  if (runtime === 'remote') {
    return {
      hostScope: 'none',
      relayHostId: target.apiHostId,
    };
  }

  if (target.apiHostId) {
    return {
      hostScope: 'explicit',
      hostId: target.apiHostId,
    };
  }

  return {
    hostScope: 'none',
  };
}

async function makeMachineRequest(
  runtime: AppRuntime,
  target: MachineTarget,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return makeLocalApiRequest(path, {
    ...options,
    headers,
    ...getMachineRequestOptions(runtime, target),
  });
}

export function createMachineClient(
  runtime: AppRuntime,
  target: MachineTarget
): MachineClient {
  const queryScopeKey = ['machine', target.id] as const;

  return {
    target,
    queryScopeKey,
    getConfig: async () =>
      handleApiResponse<UserSystemInfo>(
        await makeMachineRequest(runtime, target, '/api/info', {
          cache: 'no-store',
        })
      ),
    saveConfig: async (config) =>
      handleApiResponse<Config>(
        await makeMachineRequest(runtime, target, '/api/config', {
          method: 'PUT',
          body: JSON.stringify(config),
        })
      ),
    listRepos: async () =>
      handleApiResponse<Repo[]>(
        await makeMachineRequest(runtime, target, '/api/repos')
      ),
    updateRepo: async (repoId, data) =>
      handleApiResponse<Repo>(
        await makeMachineRequest(runtime, target, `/api/repos/${repoId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        })
      ),
    deleteRepo: async (repoId) =>
      handleApiResponse<void>(
        await makeMachineRequest(runtime, target, `/api/repos/${repoId}`, {
          method: 'DELETE',
        })
      ),
    registerRepo: async (data) =>
      handleApiResponse<Repo>(
        await makeMachineRequest(runtime, target, '/api/repos', {
          method: 'POST',
          body: JSON.stringify(data),
        })
      ),
    getRepoBranches: async (repoId) =>
      handleApiResponse<GitBranch[]>(
        await makeMachineRequest(
          runtime,
          target,
          `/api/repos/${repoId}/branches`
        )
      ),
    loadProfiles: async () =>
      handleApiResponse<{ content: string; path: string }>(
        await makeMachineRequest(runtime, target, '/api/profiles')
      ),
    saveProfiles: async (content) =>
      handleApiResponse<string>(
        await makeMachineRequest(runtime, target, '/api/profiles', {
          method: 'PUT',
          body: content,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ),
    loadMcpServers: async (query) => {
      const params = new URLSearchParams(query);
      return handleApiResponse<GetMcpServerResponse>(
        await makeMachineRequest(
          runtime,
          target,
          `/api/mcp-config?${params.toString()}`
        )
      );
    },
    saveMcpServers: async (query, data) => {
      const params = new URLSearchParams(query);
      await handleApiResponse<void>(
        await makeMachineRequest(
          runtime,
          target,
          `/api/mcp-config?${params.toString()}`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        )
      );
    },
    listAcpServers: async () =>
      handleApiResponse<InstalledAcpServer[]>(
        await makeMachineRequest(runtime, target, '/api/acp-servers')
      ),
    getAcpRegistry: async () =>
      handleApiResponse<RegistryEntryWithStatus[]>(
        await makeMachineRequest(runtime, target, '/api/acp-registry')
      ),
    installAcpFromRegistry: async (registryId) =>
      handleApiResponse<{ name: string }>(
        await makeMachineRequest(
          runtime,
          target,
          '/api/acp-servers/install-registry',
          {
            method: 'POST',
            body: JSON.stringify({ registry_id: registryId }),
          }
        )
      ),
    installAcpCustom: async (name) =>
      handleApiResponse<string>(
        await makeMachineRequest(
          runtime,
          target,
          '/api/acp-servers/install-custom',
          {
            method: 'POST',
            body: JSON.stringify({ name }),
          }
        )
      ),
    uninstallAcpServer: async (name) =>
      handleApiResponse<string>(
        await makeMachineRequest(
          runtime,
          target,
          `/api/acp-servers/${encodeURIComponent(name)}/uninstall`,
          { method: 'POST' }
        )
      ),
    getExecutorSchema: async (executor) =>
      handleApiResponse<Record<string, unknown>>(
        await makeMachineRequest(
          runtime,
          target,
          `/api/agents/schema?executor=${encodeURIComponent(executor)}`
        )
      ),
  };
}
