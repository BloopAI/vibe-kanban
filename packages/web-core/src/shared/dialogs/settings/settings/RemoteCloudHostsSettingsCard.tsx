import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import {
  usePairRemoteCloudHostMutation,
  useRemoteCloudHostsState,
  useRemoveRemoteCloudHostMutation,
} from '@/shared/hooks/useRemoteCloudHosts';
import type { RelayPairedHost } from 'shared/types';
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from './SettingsComponents';
import { PairingCodeInput } from './PairingCodeInput';
import { normalizeEnrollmentCode } from '@/shared/lib/relayPake';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import {
  usePairRelayHostMutation,
  useRelayRemoteHostsQuery,
  useRelayRemotePairedHostsQuery,
  useRemovePairedRelayHostMutation,
} from './useRelayRemoteHostMutations';
import { createRelayClientIdentity } from '@/shared/lib/relayClientIdentity';

export function RemoteCloudHostsSettingsCardContent({
  initialHostId,
  mode = 'local',
  onClose,
}: {
  initialHostId?: string;
  mode?: 'local' | 'remote';
  onClose?: () => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const navigate = useNavigate();
  const { hostId: routeHostId } = useParams({ strict: false });
  const [hostName, setHostName] = useState('');
  const [selectedHostId, setSelectedHostId] = useState<string | undefined>();
  const [pairingCode, setPairingCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removingHostId, setRemovingHostId] = useState<string | null>(null);
  const hasAppliedInitialHostRef = useRef(false);
  const { machineId } = useUserSystem();

  const { data: relayHosts = [], isLoading: relayHostsLoading } = useQuery({
    ...useRelayRemoteHostsQuery(),
  });
  const isRemoteMode = mode === 'remote';
  const { data: localData, isLoading: localStateLoading } =
    useRemoteCloudHostsState();
  const { data: remotePairedHosts = [], isLoading: remotePairedHostsLoading } =
    useQuery({
      ...useRelayRemotePairedHostsQuery(),
      enabled: isRemoteMode,
    });
  const { mutateAsync: pairLocalHost, isPending: isPairingLocal } =
    usePairRemoteCloudHostMutation();
  const { mutateAsync: removeLocalHost, isPending: isRemovingLocal } =
    useRemoveRemoteCloudHostMutation();
  const { mutateAsync: pairRemoteHost, isPending: isPairingRemote } =
    usePairRelayHostMutation();
  const { mutateAsync: removeRemoteHost, isPending: isRemovingRemote } =
    useRemovePairedRelayHostMutation();
  const isDevMode = import.meta.env.DEV;
  const pairableRelayHosts = useMemo(() => {
    if (isRemoteMode || !machineId || isDevMode) {
      return relayHosts;
    }

    return relayHosts.filter((host) => host.machine_id !== machineId);
  }, [isDevMode, isRemoteMode, machineId, relayHosts]);
  const defaultClientName = useMemo(
    () => createRelayClientIdentity().clientName,
    []
  );

  useEffect(() => {
    if (pairableRelayHosts.length === 0) {
      setSelectedHostId(undefined);
      return;
    }

    if (!selectedHostId) {
      setSelectedHostId(pairableRelayHosts[0].id);
      return;
    }

    if (!pairableRelayHosts.some((host) => host.id === selectedHostId)) {
      setSelectedHostId(pairableRelayHosts[0].id);
    }
  }, [pairableRelayHosts, selectedHostId]);

  useEffect(() => {
    if (!initialHostId || hasAppliedInitialHostRef.current) {
      return;
    }

    if (relayHostsLoading) {
      return;
    }

    const initialHost = pairableRelayHosts.find(
      (host) => host.id === initialHostId
    );
    if (!initialHost) {
      hasAppliedInitialHostRef.current = true;
      return;
    }

    setSelectedHostId(initialHost.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    hasAppliedInitialHostRef.current = true;
  }, [initialHostId, pairableRelayHosts, relayHostsLoading]);

  const relayHostOptions = useMemo(
    () =>
      pairableRelayHosts.map((host) => ({
        value: host.id,
        label: host.name,
      })),
    [pairableRelayHosts]
  );

  const connectedHosts = useMemo(() => {
    if (isRemoteMode) {
      return remotePairedHosts
        .map((host: RelayPairedHost) => {
          const liveHost = relayHosts.find(
            (entry) => entry.id === host.host_id
          );
          return {
            id: host.host_id,
            name: liveHost?.name ?? host.host_name ?? host.host_id,
            status: liveHost?.status ?? 'offline',
            pairedAt: host.paired_at ?? '',
            lastUsedAt: host.paired_at ?? '',
          };
        })
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
    }

    const hosts = localData?.hosts ?? [];
    return [...hosts].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }, [isRemoteMode, localData?.hosts, relayHosts, remotePairedHosts]);

  const isLoading = isRemoteMode ? remotePairedHostsLoading : localStateLoading;
  const isPairing = isRemoteMode ? isPairingRemote : isPairingLocal;
  const isRemoving = isRemoteMode ? isRemovingRemote : isRemovingLocal;

  const canSubmitPairing =
    !!selectedHostId &&
    normalizeEnrollmentCode(pairingCode).length === 6 &&
    !isPairing;

  const resetForm = () => {
    setHostName('');
    setPairingCode('');
  };

  const handleConnect = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedHostId) {
      setErrorMessage(
        t(
          'settings.relay.remoteCloudHost.hostRequired',
          'Select a host to connect.'
        )
      );
      return;
    }

    const selectedHost = pairableRelayHosts.find(
      (host) => host.id === selectedHostId
    );
    if (!selectedHost) {
      setErrorMessage(
        t(
          'settings.relay.remoteCloudHost.hostMissing',
          'Selected host is no longer available.'
        )
      );
      return;
    }

    const normalizedCode = normalizeEnrollmentCode(pairingCode);
    const effectiveHostName = hostName.trim() || defaultClientName;

    try {
      if (isRemoteMode) {
        await pairRemoteHost({
          hostId: selectedHost.id,
          hostName: effectiveHostName,
          normalizedCode,
        });
      } else {
        await pairLocalHost({
          host_id: selectedHost.id,
          host_name: effectiveHostName,
          enrollment_code: normalizedCode,
        });
      }
      setSuccessMessage(
        t(
          'settings.relay.remoteCloudHost.connectSuccess',
          'Remote Cloud Host connected.'
        )
      );
      resetForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRemove = async (hostId: string) => {
    const confirmed = window.confirm(
      t(
        'settings.relay.remoteCloudHost.removeConfirm',
        'Remove this remote cloud host from local settings?'
      )
    );

    if (!confirmed) {
      return;
    }

    setRemovingHostId(hostId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (isRemoteMode) {
        await removeRemoteHost(hostId);
      } else {
        await removeLocalHost(hostId);
      }
      if (hostId === routeHostId) {
        void navigate({ to: '/' });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRemovingHostId(null);
    }
  };

  const handleGoToHostWorkspaces = (hostId: string, status?: string) => {
    if (status === 'offline') {
      return;
    }

    onClose?.();
    void navigate({
      to: '/hosts/$hostId/workspaces',
      params: { hostId },
    });
  };

  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-3 text-success text-sm">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-3 text-error text-sm">
          {errorMessage}
        </div>
      )}

      <SettingsField
        label={t('settings.relay.client.pair.hostLabel', 'Host to pair to')}
      >
        <SettingsSelect
          value={selectedHostId}
          options={relayHostOptions}
          onChange={setSelectedHostId}
          placeholder={t(
            'settings.relay.remoteCloudHost.hostPlaceholder',
            relayHostsLoading
              ? 'Loading hosts...'
              : pairableRelayHosts.length === 0
                ? 'No hosts available'
                : 'Select a host'
          )}
          disabled={relayHostsLoading || relayHostOptions.length === 0}
        />
      </SettingsField>

      {!relayHostsLoading && pairableRelayHosts.length === 0 && (
        <p className="text-sm text-low">
          {t(
            'settings.relay.remoteCloudHost.hostsUnavailable',
            'No hosts found yet. Make sure another device is running as a host and has paired with this account.'
          )}
        </p>
      )}

      {selectedHostId && (
        <>
          <SettingsField
            label={t(
              'settings.relay.client.pair.nameLabel',
              'How this device appears on that host (optional)'
            )}
          >
            <SettingsInput
              value={hostName}
              onChange={setHostName}
              placeholder={t(
                'settings.relay.remoteCloudHost.namePlaceholder',
                defaultClientName
              )}
            />
          </SettingsField>

          <SettingsField
            label={t(
              'settings.relay.client.pair.pairingCodeLabel',
              'Pairing code from the host'
            )}
            description={t(
              'settings.relay.client.pair.pairingCodeHelp',
              'Enter the 6-character code shown on the host you want to connect to.'
            )}
          >
            <PairingCodeInput value={pairingCode} onChange={setPairingCode} />
          </SettingsField>

          <div className="flex items-center gap-2">
            <PrimaryButton
              value={t(
                'settings.relay.client.pair.confirm',
                'Pair this device'
              )}
              onClick={() => void handleConnect()}
              disabled={!canSubmitPairing}
              actionIcon={isPairing ? 'spinner' : undefined}
            />
            <PrimaryButton
              variant="tertiary"
              value={t('common:buttons.cancel')}
              onClick={resetForm}
              disabled={isPairing}
            />
          </div>

          <hr className="border-border" />

          <div className="space-y-2">
            <span className="text-sm font-medium text-normal">
              {t(
                'settings.relay.client.connectedHosts.title',
                'Connected hosts'
              )}
            </span>

            {!isLoading && connectedHosts.length === 0 && (
              <div className="rounded-sm border border-border bg-secondary/30 p-3 text-sm text-low">
                {t(
                  'settings.relay.remoteCloudHost.empty',
                  'No hosts paired yet.'
                )}
              </div>
            )}

            {!isLoading && connectedHosts.length > 0 && (
              <div className="space-y-2">
                {connectedHosts.map((host) => {
                  const isOffline = isRemoteMode && host.status === 'offline';

                  return (
                    <div
                      key={host.id}
                      className={[
                        'rounded-sm border border-border bg-secondary/30 p-3 flex items-center justify-between gap-3',
                        isOffline
                          ? 'opacity-80'
                          : 'cursor-pointer hover:bg-secondary/50',
                      ].join(' ')}
                      onClick={(event) => {
                        const target = event.target as HTMLElement | null;
                        if (
                          target?.closest('[data-relay-host-action="remove"]')
                        ) {
                          return;
                        }
                        void handleGoToHostWorkspaces(host.id, host.status);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-high truncate">
                          {host.name}
                        </p>
                        <p className="text-xs text-low truncate">
                          {isRemoteMode && host.status
                            ? `${host.status === 'online' ? 'Online' : 'Offline'}${host.pairedAt ? ` · Paired ${new Date(host.pairedAt).toLocaleDateString()}` : ''}`
                            : host.id}
                        </p>
                      </div>
                      <span data-relay-host-action="remove">
                        <PrimaryButton
                          variant="tertiary"
                          value={t(
                            'settings.relay.remoteCloudHost.remove',
                            'Remove'
                          )}
                          onClick={() => void handleRemove(host.id)}
                          disabled={isRemoving}
                          actionIcon={
                            removingHostId === host.id ? 'spinner' : undefined
                          }
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
