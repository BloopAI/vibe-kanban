import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { SpinnerIcon } from '@phosphor-icons/react';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import {
  usePairRemoteCloudHostMutation,
  useRemoteCloudHostsState,
  useRemoveRemoteCloudHostMutation,
  useSetActiveRemoteCloudHostMutation,
} from '@/shared/hooks/useRemoteCloudHosts';
import {
  SettingsCard,
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from './SettingsComponents';
import { PairingCodeInput } from './PairingCodeInput';
import { normalizeEnrollmentCode } from '@/shared/lib/relayPake';
import { useRelayRemoteHostsQuery } from './useRelayRemoteHostMutations';

export function RemoteCloudHostsSettingsCard() {
  const { t } = useTranslation(['settings', 'common']);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [hostName, setHostName] = useState('');
  const [selectedHostId, setSelectedHostId] = useState<string | undefined>();
  const [pairingCode, setPairingCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removingHostId, setRemovingHostId] = useState<string | null>(null);
  const [activatingHostId, setActivatingHostId] = useState<string | null>(null);

  const { data: relayHosts = [], isLoading: relayHostsLoading } = useQuery({
    ...useRelayRemoteHostsQuery(),
  });
  const { data, isLoading } = useRemoteCloudHostsState();
  const { mutateAsync: pairHost, isPending: isPairing } =
    usePairRemoteCloudHostMutation();
  const { mutateAsync: removeHost, isPending: isRemoving } =
    useRemoveRemoteCloudHostMutation();
  const { mutateAsync: setActiveHost, isPending: isActivating } =
    useSetActiveRemoteCloudHostMutation();

  useEffect(() => {
    if (relayHosts.length === 0) {
      setSelectedHostId(undefined);
      return;
    }

    if (!selectedHostId) {
      setSelectedHostId(relayHosts[0].id);
      return;
    }

    if (!relayHosts.some((host) => host.id === selectedHostId)) {
      setSelectedHostId(relayHosts[0].id);
    }
  }, [relayHosts, selectedHostId]);

  const relayHostOptions = useMemo(
    () =>
      relayHosts.map((host) => ({
        value: host.id,
        label: host.name,
      })),
    [relayHosts]
  );

  const connectedHosts = useMemo(() => {
    const hosts = data?.hosts ?? [];
    const activeHostId = data?.activeHostId ?? null;

    return [...hosts].sort((a, b) => {
      if (a.id === activeHostId) return -1;
      if (b.id === activeHostId) return 1;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    });
  }, [data?.activeHostId, data?.hosts]);

  const canSubmitPairing =
    !!selectedHostId &&
    normalizeEnrollmentCode(pairingCode).length === 6 &&
    !isPairing;

  const resetForm = () => {
    setHostName('');
    setPairingCode('');
    setShowConnectForm(false);
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

    const selectedHost = relayHosts.find((host) => host.id === selectedHostId);
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
    const effectiveHostName = hostName.trim() || selectedHost.name;

    try {
      await pairHost({
        host_id: selectedHost.id,
        host_name: effectiveHostName,
        enrollment_code: normalizedCode,
      });
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
      await removeHost(hostId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRemovingHostId(null);
    }
  };

  const handleSetActive = async (hostId: string) => {
    setActivatingHostId(hostId);
    setErrorMessage(null);

    try {
      await setActiveHost(hostId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActivatingHostId(null);
    }
  };

  return (
    <SettingsCard
      title={t(
        'settings.relay.remoteCloudHost.title',
        'Remote Cloud Hosts (preview)'
      )}
      description={t(
        'settings.relay.remoteCloudHost.description',
        'Pair remote hosts using enrollment codes and manage local paired hosts.'
      )}
      headerAction={
        <PrimaryButton
          variant="secondary"
          value={t('settings.relay.remoteCloudHost.connect', 'Connect host')}
          onClick={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
            setShowConnectForm((current) => !current);
          }}
        />
      }
    >
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

      {showConnectForm && (
        <div className="border border-border rounded-sm bg-secondary/40 p-4 space-y-4">
          <SettingsField
            label={t('settings.relay.remoteCloudHost.hostLabel', 'Host')}
            description={t(
              'settings.relay.remoteCloudHost.hostHelp',
              'Select a relay host to pair with this local instance.'
            )}
          >
            <SettingsSelect
              value={selectedHostId}
              options={relayHostOptions}
              onChange={setSelectedHostId}
              placeholder={t(
                'settings.relay.remoteCloudHost.hostPlaceholder',
                relayHostsLoading ? 'Loading hosts...' : 'Select a host'
              )}
              disabled={relayHostsLoading || relayHostOptions.length === 0}
            />
          </SettingsField>

          <SettingsField
            label={t(
              'settings.relay.remoteCloudHost.nameLabel',
              'Display name (optional)'
            )}
          >
            <SettingsInput
              value={hostName}
              onChange={setHostName}
              placeholder={t(
                'settings.relay.remoteCloudHost.namePlaceholder',
                'Production Host'
              )}
            />
          </SettingsField>

          <SettingsField
            label={t(
              'settings.relay.remoteCloudHost.pairingCodeLabel',
              'Pairing code'
            )}
            description={t(
              'settings.relay.remoteCloudHost.pairingCodeHelp',
              'Enter the 6-character code shown by the remote host.'
            )}
          >
            <PairingCodeInput value={pairingCode} onChange={setPairingCode} />
          </SettingsField>

          <div className="flex items-center gap-2">
            <PrimaryButton
              value={t(
                'settings.relay.remoteCloudHost.connectConfirm',
                'Connect'
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
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-normal">
          {t('settings.relay.remoteCloudHost.connected', 'Connected hosts')}
        </h4>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-low">
            <SpinnerIcon className="size-icon-sm animate-spin" weight="bold" />
            <span>
              {t('settings.relay.remoteCloudHost.loading', 'Loading hosts...')}
            </span>
          </div>
        )}

        {!isLoading && connectedHosts.length === 0 && (
          <div className="rounded-sm border border-border bg-secondary/30 p-3 text-sm text-low">
            {t(
              'settings.relay.remoteCloudHost.empty',
              'No remote cloud hosts connected yet.'
            )}
          </div>
        )}

        {!isLoading && connectedHosts.length > 0 && (
          <div className="space-y-2">
            {connectedHosts.map((host) => {
              const isActive = host.id === (data?.activeHostId ?? null);

              return (
                <div
                  key={host.id}
                  className="rounded-sm border border-border bg-secondary/30 p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-high truncate">
                      {host.name}
                    </p>
                    <p className="text-xs text-low truncate">{host.id}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isActive ? (
                      <span className="text-xs text-success">
                        {t('settings.relay.remoteCloudHost.active', 'Active')}
                      </span>
                    ) : (
                      <PrimaryButton
                        variant="tertiary"
                        value={t(
                          'settings.relay.remoteCloudHost.makeActive',
                          'Make active'
                        )}
                        onClick={() => void handleSetActive(host.id)}
                        disabled={isActivating || isRemoving}
                        actionIcon={
                          activatingHostId === host.id ? 'spinner' : undefined
                        }
                      />
                    )}

                    <PrimaryButton
                      variant="tertiary"
                      value={t(
                        'settings.relay.remoteCloudHost.remove',
                        'Remove'
                      )}
                      onClick={() => void handleRemove(host.id)}
                      disabled={isRemoving || isActivating}
                      actionIcon={
                        removingHostId === host.id ? 'spinner' : undefined
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
