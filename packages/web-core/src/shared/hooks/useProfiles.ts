import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profilesApi } from '@/shared/lib/api';
import { getHostRequestScopeQueryKey } from '@/shared/lib/hostRequestScope';
import type { MachineClient } from '@/shared/lib/machineClient';
import type { JsonValue } from 'shared/types';
import { presetOptionsKeys } from '@/shared/hooks/usePresetOptions';

export type UseProfilesReturn = {
  // data
  profilesContent: string;
  parsedProfiles: JsonValue | null;
  profilesPath: string;

  // status
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isSaving: boolean;

  // actions
  refetch: () => void;
  save: (content: string) => Promise<void>;
  saveParsed: (obj: unknown) => Promise<void>;
};

export function useProfiles(hostId?: string | null): UseProfilesReturn {
  const queryClient = useQueryClient();
  const queryKey = ['profiles', getHostRequestScopeQueryKey(hostId)] as const;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => profilesApi.load(hostId),
    staleTime: 1000 * 60, // 1 minute cache
  });

  const { mutateAsync: saveMutation, isPending: isSaving } = useMutation({
    mutationFn: (content: string) => profilesApi.save(content, hostId),
    onSuccess: (_, content) => {
      // Optimistically update cache with new content
      queryClient.setQueryData<{ content: string; path: string }>(
        queryKey,
        (old) => (old ? { ...old, content } : old)
      );
      void queryClient.invalidateQueries({
        queryKey: presetOptionsKeys.all,
      });
    },
  });

  const save = async (content: string): Promise<void> => {
    await saveMutation(content);
  };

  const parsedProfiles = useMemo(() => {
    if (!data?.content) return null;
    try {
      return JSON.parse(data.content);
    } catch {
      return null;
    }
  }, [data?.content]);

  const saveParsed = async (obj: unknown) => {
    await save(JSON.stringify(obj, null, 2));
  };

  return {
    profilesContent: data?.content ?? '',
    parsedProfiles,
    profilesPath: data?.path ?? '',
    isLoading,
    isError,
    error,
    isSaving,
    refetch,
    save,
    saveParsed,
  };
}

export function useMachineProfiles(
  machineClient: MachineClient | null
): UseProfilesReturn {
  const queryClient = useQueryClient();
  const queryKey = [
    'profiles',
    ...(machineClient?.queryScopeKey ?? ['machine', 'unselected']),
  ] as const;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      if (!machineClient) {
        throw new Error('Machine client is required');
      }

      return machineClient.loadProfiles();
    },
    enabled: machineClient != null,
    staleTime: 1000 * 60,
  });

  const { mutateAsync: saveMutation, isPending: isSaving } = useMutation({
    mutationFn: (content: string) => {
      if (!machineClient) {
        throw new Error('Machine client is required');
      }

      return machineClient.saveProfiles(content);
    },
    onSuccess: (_, content) => {
      queryClient.setQueryData<{ content: string; path: string }>(
        queryKey,
        (old) => (old ? { ...old, content } : old)
      );
      void queryClient.invalidateQueries({
        queryKey: presetOptionsKeys.all,
      });
    },
  });

  const save = async (content: string): Promise<void> => {
    await saveMutation(content);
  };

  const parsedProfiles = useMemo(() => {
    if (!data?.content) return null;
    try {
      return JSON.parse(data.content);
    } catch {
      return null;
    }
  }, [data?.content]);

  const saveParsed = async (obj: unknown) => {
    await save(JSON.stringify(obj, null, 2));
  };

  return {
    profilesContent: data?.content ?? '',
    parsedProfiles,
    profilesPath: data?.path ?? '',
    isLoading,
    isError,
    error,
    isSaving,
    refetch,
    save,
    saveParsed,
  };
}
