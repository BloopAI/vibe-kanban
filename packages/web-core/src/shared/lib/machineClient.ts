import type {
  Config,
  GetMcpServerResponse,
  GitBranch,
  McpServerQuery,
  Repo,
  UpdateMcpServersBody,
  UpdateRepo,
  UserSystemInfo,
} from 'shared/types';
import type { AppRuntime } from '@/shared/hooks/useAppRuntime';
import { configApi, mcpServersApi, profilesApi, repoApi } from './api';
import {
  getRelayActiveHostOverride,
  setRelayActiveHostOverride,
} from './relayActiveHostOverride';

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
}

async function withMachineRequestScope<T>(
  runtime: AppRuntime,
  target: MachineTarget,
  request: (hostId: string | null) => Promise<T>
): Promise<T> {
  if (runtime === 'local') {
    return request(target.apiHostId);
  }

  const previousHostId = getRelayActiveHostOverride();
  setRelayActiveHostOverride(target.apiHostId);

  try {
    return await request(null);
  } finally {
    setRelayActiveHostOverride(previousHostId);
  }
}

export function createMachineClient(
  runtime: AppRuntime,
  target: MachineTarget
): MachineClient {
  const queryScopeKey = ['machine', target.id] as const;

  return {
    target,
    queryScopeKey,
    getConfig: () =>
      withMachineRequestScope(runtime, target, (hostId) =>
        configApi.getConfig(hostId)
      ),
    saveConfig: (config) =>
      withMachineRequestScope(runtime, target, (hostId) =>
        configApi.saveConfig(config, hostId)
      ),
    listRepos: () =>
      withMachineRequestScope(runtime, target, (hostId) =>
        repoApi.list(hostId)
      ),
    updateRepo: (repoId, data) =>
      withMachineRequestScope(runtime, target, (hostId) =>
        repoApi.update(repoId, data, hostId)
      ),
    deleteRepo: (repoId) =>
      withMachineRequestScope(runtime, target, (hostId) =>
        repoApi.delete(repoId, hostId)
      ),
    registerRepo: (data) =>
      withMachineRequestScope(runtime, target, (hostId) =>
        repoApi.register(data, hostId)
      ),
    getRepoBranches: (repoId) =>
      withMachineRequestScope(runtime, target, (hostId) =>
        repoApi.getBranches(repoId, hostId)
      ),
    loadProfiles: () =>
      withMachineRequestScope(runtime, target, (hostId) =>
        profilesApi.load(hostId)
      ),
    saveProfiles: (content) =>
      withMachineRequestScope(runtime, target, (hostId) =>
        profilesApi.save(content, hostId)
      ),
    loadMcpServers: (query) =>
      withMachineRequestScope(runtime, target, (hostId) =>
        mcpServersApi.load(query, hostId)
      ),
    saveMcpServers: (query, data) =>
      withMachineRequestScope(runtime, target, (hostId) =>
        mcpServersApi.save(query, data, hostId)
      ),
  };
}
