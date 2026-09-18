import { useMutation } from '@tanstack/react-query';
import { oauthApi } from '@/shared/lib/api';

interface UseAuthMutationsOptions {
  onInitSuccess?: (data: { handoff_id: string; authorize_url: string }) => void;
  onInitError?: (err: unknown) => void;
}

export function useAuthMutations(options?: UseAuthMutationsOptions) {
  const initHandoff = useMutation({
    mutationKey: ['auth', 'init'],
    mutationFn: ({
      provider,
      returnTo,
      desktop,
    }: {
      provider: string;
      returnTo: string;
      desktop?: boolean;
    }) => oauthApi.handoffInit(provider, returnTo, desktop),
    onSuccess: (data) => {
      options?.onInitSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to initialize OAuth handoff:', err);
      options?.onInitError?.(err);
    },
  });

  return {
    initHandoff,
  };
}
