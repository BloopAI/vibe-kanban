import { ReactNode, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BaseAgentCapability,
  Config,
  Environment,
  ExecutorProfile,
  UserSystemInfo,
} from 'shared/types';
import {
  UserSystemContext,
  type UserSystemContextType,
} from '@/shared/hooks/useUserSystem';
import { configApi } from '@/shared/lib/api';

export function ScopedUserSystemProvider({
  hostId,
  children,
}: {
  hostId: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const userSystemQueryKey = useMemo(
    () => ['settings-user-system', hostId ?? 'local'] as const,
    [hostId]
  );

  const { data: userSystemInfo, isLoading } = useQuery({
    queryKey: userSystemQueryKey,
    queryFn: () => configApi.getConfig(hostId),
    staleTime: 5 * 60 * 1000,
  });

  const config = userSystemInfo?.config || null;
  const appVersion = userSystemInfo?.version || null;
  const environment = userSystemInfo?.environment || null;
  const analyticsUserId = userSystemInfo?.analytics_user_id || null;
  const loginStatus = userSystemInfo?.login_status || null;
  const profiles =
    (userSystemInfo?.executors as Record<string, ExecutorProfile> | null) ||
    null;
  const capabilities =
    (userSystemInfo?.capabilities as Record<
      string,
      BaseAgentCapability[]
    > | null) || null;

  const updateConfig = useCallback(
    (updates: Partial<Config>) => {
      queryClient.setQueryData<UserSystemInfo>(userSystemQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          config: { ...old.config, ...updates },
        };
      });
    },
    [queryClient, userSystemQueryKey]
  );

  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!config) return false;
    try {
      await configApi.saveConfig(config, hostId);
      return true;
    } catch (err) {
      console.error('Error saving config:', err);
      return false;
    }
  }, [config, hostId]);

  const updateAndSaveConfig = useCallback(
    async (updates: Partial<Config>): Promise<boolean> => {
      if (!config) return false;

      const newConfig = { ...config, ...updates };
      updateConfig(updates);

      try {
        const saved = await configApi.saveConfig(newConfig, hostId);
        queryClient.setQueryData<UserSystemInfo>(userSystemQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            config: saved,
          };
        });
        return true;
      } catch (err) {
        console.error('Error saving config:', err);
        queryClient.invalidateQueries({ queryKey: userSystemQueryKey });
        return false;
      }
    },
    [config, hostId, queryClient, updateConfig, userSystemQueryKey]
  );

  const reloadSystem = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: userSystemQueryKey });
  }, [queryClient, userSystemQueryKey]);

  const setEnvironment = useCallback(
    (env: Environment | null) => {
      queryClient.setQueryData<UserSystemInfo>(userSystemQueryKey, (old) => {
        if (!old || !env) return old;
        return { ...old, environment: env };
      });
    },
    [queryClient, userSystemQueryKey]
  );

  const setProfiles = useCallback(
    (newProfiles: Record<string, ExecutorProfile> | null) => {
      queryClient.setQueryData<UserSystemInfo>(userSystemQueryKey, (old) => {
        if (!old || !newProfiles) return old;
        return {
          ...old,
          executors: newProfiles as unknown as UserSystemInfo['executors'],
        };
      });
    },
    [queryClient, userSystemQueryKey]
  );

  const setCapabilities = useCallback(
    (newCapabilities: Record<string, BaseAgentCapability[]> | null) => {
      queryClient.setQueryData<UserSystemInfo>(userSystemQueryKey, (old) => {
        if (!old || !newCapabilities) return old;
        return { ...old, capabilities: newCapabilities };
      });
    },
    [queryClient, userSystemQueryKey]
  );

  const value = useMemo<UserSystemContextType>(
    () => ({
      system: {
        appVersion,
        config,
        environment,
        profiles,
        capabilities,
        analyticsUserId,
        loginStatus,
      },
      appVersion,
      config,
      environment,
      profiles,
      capabilities,
      analyticsUserId,
      loginStatus,
      updateConfig,
      saveConfig,
      updateAndSaveConfig,
      setEnvironment,
      setProfiles,
      setCapabilities,
      reloadSystem,
      loading: isLoading,
    }),
    [
      analyticsUserId,
      appVersion,
      capabilities,
      config,
      environment,
      isLoading,
      loginStatus,
      profiles,
      reloadSystem,
      saveConfig,
      setCapabilities,
      setEnvironment,
      setProfiles,
      updateAndSaveConfig,
      updateConfig,
    ]
  );

  return (
    <UserSystemContext.Provider value={value}>
      {children}
    </UserSystemContext.Provider>
  );
}
