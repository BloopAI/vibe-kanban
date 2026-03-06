import { useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AUTH_CHANGED_EVENT, isLoggedIn } from "@remote/shared/lib/auth";
import { getIdentity } from "@remote/shared/lib/api";
import {
  AuthContext,
  type AuthContextValue,
} from "@/shared/hooks/auth/useAuth";

const TOKENS_QUERY_KEY = ["remote-auth", "tokens"] as const;
const IDENTITY_QUERY_KEY = ["remote-auth", "identity"] as const;

interface RemoteAuthProviderProps {
  children: ReactNode;
}

export function RemoteAuthProvider({ children }: RemoteAuthProviderProps) {
  const queryClient = useQueryClient();

  const tokensQuery = useQuery({
    queryKey: TOKENS_QUERY_KEY,
    queryFn: () => isLoggedIn(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const hasTokens = tokensQuery.data === true;

  const identityQuery = useQuery({
    queryKey: IDENTITY_QUERY_KEY,
    queryFn: () => getIdentity(),
    enabled: hasTokens,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const identityUserId = identityQuery.data?.user_id ?? null;

  useEffect(() => {
    const handleAuthChanged = () => {
      void queryClient.invalidateQueries({ queryKey: TOKENS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: IDENTITY_QUERY_KEY });
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    if (tokensQuery.status === "pending") {
      return { isSignedIn: false, isLoaded: false, userId: null };
    }

    if (!hasTokens) {
      return { isSignedIn: false, isLoaded: true, userId: null };
    }

    if (identityQuery.status === "pending") {
      return { isSignedIn: false, isLoaded: false, userId: null };
    }

    if (identityUserId) {
      return {
        isSignedIn: true,
        isLoaded: true,
        userId: identityUserId,
      };
    }

    return { isSignedIn: false, isLoaded: true, userId: null };
  }, [tokensQuery.status, hasTokens, identityQuery.status, identityUserId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
