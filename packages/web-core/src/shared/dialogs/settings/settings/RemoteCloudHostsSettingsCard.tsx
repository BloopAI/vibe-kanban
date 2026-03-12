import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowSquareOutIcon, SpinnerIcon } from '@phosphor-icons/react';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import {
  usePairRemoteCloudHostMutation,
  useRemoteCloudHostsState,
  useRemoveRemoteCloudHostMutation,
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
  return <RemoteCloudHostsSettingsCardContent />;
}

export function RemoteCloudHostsSettingsCardContent({
  embedded = false,
  initialHostId,
}: {
  embedded?: boolean;
  initialHostId?: string;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const navigate = useNavigate();
  const { hostId: routeHostId } = useParams({ strict: false });
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [hostName, setHostName] = useState('');
  const [selectedHostId, setSelectedHostId] = useState<string | undefined>();
  const [pairingCode, setPairingCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removingHostId, setRemovingHostId] = useState<string | null>(null);
  const hasAppliedInitialHostRef = useRef(false);

  const { data: relayHosts = [], isLoading: relayHostsLoading } = useQuery({
    ...useRelayRemoteHostsQuery(),
  });
  const { data, isLoading } = useRemoteCloudHostsState();
  const { mutateAsync: pairHost, isPending: isPairing } =
    usePairRemoteCloudHostMutation();
  const { mutateAsync: removeHost, isPending: isRemoving } =
    useRemoveRemoteCloudHostMutation();

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

  useEffect(() => {
    if (!initialHostId || hasAppliedInitialHostRef.current) {
      return;
    }

    if (relayHostsLoading) {
      return;
    }

    const initialHost = relayHosts.find((host) => host.id === initialHostId);
    if (!initialHost) {
      hasAppliedInitialHostRef.current = true;
      return;
    }

    setSelectedHostId(initialHost.id);
    setShowConnectForm(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    hasAppliedInitialHostRef.current = true;
  }, [initialHostId, relayHosts, relayHostsLoading]);

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
    return [...hosts].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }, [data?.hosts]);

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
      if (hostId === routeHostId) {
        void navigate({ to: '/' });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRemovingHostId(null);
    }
  };

  const content = (
    <>
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
            label={t('settings.relay.client.pair.hostLabel', 'Host to pair to')}
            description={t(
              'settings.relay.client.pair.hostHelp',
              'Choose the host this device should connect to.'
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
              'settings.relay.client.pair.nameLabel',
              'How this device appears on that host (optional)'
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
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-normal">
          <ArrowSquareOutIcon
            className="size-icon-sm text-brand"
            weight="bold"
          />
          <span>
            {t(
              'settings.relay.client.connectedHosts.title',
              'Hosts this device can access'
            )}
          </span>
        </div>

        <p className="text-sm text-low">
          {t(
            'settings.relay.client.connectedHosts.description',
            'These are hosts that this device is already paired to as a client.'
          )}
        </p>

        {relayHostsLoading && (
          <div className="flex items-center gap-2 text-sm text-low">
            <SpinnerIcon className="size-icon-sm animate-spin" weight="bold" />
            <span>
              {t(
                'settings.relay.client.availableHosts.loading',
                'Loading available hosts...'
              )}
            </span>
          </div>
        )}

        {!relayHostsLoading &&
          relayHostOptions.length === 0 &&
          connectedHosts.length === 0 && (
            <div className="rounded-sm border border-border bg-secondary/30 p-3 text-sm text-low">
              {t(
                'settings.relay.client.availableHosts.empty',
                'No hosts are available to pair right now.'
              )}
            </div>
          )}

        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton
            variant="secondary"
            value={t(
              'settings.relay.client.pair.button',
              'Pair this device to a host'
            )}
            onClick={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
              setShowConnectForm((current) => !current);
            }}
            disabled={
              relayHostsLoading ||
              (relayHostOptions.length === 0 && !showConnectForm)
            }
          />
        </div>

        <h4 className="pt-2 text-sm font-medium text-normal">
          {t('settings.relay.client.connectedHosts.heading', 'Paired hosts')}
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <SettingsCard
      title={t('settings.relay.client.title', 'Use this device as a client')}
      description={t(
        'settings.relay.client.description',
        'Pair this device to other hosts using a one-time code, then reconnect to them from here.'
      )}
    >
      {content}
    </SettingsCard>
  );
}
