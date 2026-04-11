import { ReactNode, useCallback, useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { configApi } from "@/shared/lib/api";
import { useAuth } from "@/shared/hooks/auth/useAuth";
import { useUserSystemController } from "@/shared/hooks/useUserSystemController";
import { UserSystemContext } from "@/shared/hooks/useUserSystem";

interface RemoteUserSystemProviderProps {
  children: ReactNode;
}

export function RemoteUserSystemProvider({
  children,
}: RemoteUserSystemProviderProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const { hostId } = useParams({ strict: false });
  const loadConfig = useCallback(() => configApi.getConfig(), []);
  const saveConfig = useCallback(
    (config: Parameters<typeof configApi.saveConfig>[0]) =>
      configApi.saveConfig(config),
    [],
  );
  const userSystemQueryKey = useMemo(
    () => ["user-system", "remote-route", hostId] as const,
    [hostId],
  );
  const { value, isLoading } = useUserSystemController({
    queryKey: userSystemQueryKey,
    enabled: isLoaded && isSignedIn && !!hostId,
    load: loadConfig,
    save: saveConfig,
  });

  const contextValue = useMemo(
    () => ({
      ...value,
      loading: !isLoaded || (isSignedIn && isLoading),
    }),
    [isLoaded, isLoading, isSignedIn, value],
  );

  return (
    <UserSystemContext.Provider value={contextValue}>
      {children}
    </UserSystemContext.Provider>
  );
}
