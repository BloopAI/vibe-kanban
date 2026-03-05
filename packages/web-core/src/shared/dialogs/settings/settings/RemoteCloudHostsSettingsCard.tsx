import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
} from './SettingsComponents';
import { PairingCodeInput } from './PairingCodeInput';
import { normalizeEnrollmentCode } from '@/shared/lib/relayPake';

export function RemoteCloudHostsSettingsCard() {
  const { t } = useTranslation(['settings', 'common']);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [hostName, setHostName] = useState('');
  const [hostUrl, setHostUrl] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removingHostId, setRemovingHostId] = useState<string | null>(null);
  const [activatingHostId, setActivatingHostId] = useState<string | null>(null);

  const { data, isLoading } = useRemoteCloudHostsState();
  const { mutateAsync: pairHost, isPending: isPairing } =
    usePairRemoteCloudHostMutation();
  const { mutateAsync: removeHost, isPending: isRemoving } =
    useRemoveRemoteCloudHostMutation();
  const { mutateAsync: setActiveHost, isPending: isActivating } =
    useSetActiveRemoteCloudHostMutation();

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
    hostUrl.trim().length > 0 &&
    normalizeEnrollmentCode(pairingCode).length === 6 &&
    !isPairing;

  const resetForm = () => {
    setHostName('');
    setHostUrl('');
    setPairingCode('');
    setShowConnectForm(false);
  };

  const handleConnect = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await pairHost({
        hostName,
        baseUrl: hostUrl,
        pairingCode,
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
        'Save remote cloud host connections locally with a host URL and pairing code. Backend integration will be wired next.'
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
            label={t('settings.relay.remoteCloudHost.urlLabel', 'Host URL')}
            description={t(
              'settings.relay.remoteCloudHost.urlHelp',
              'Example: https://remote.company.com'
            )}
          >
            <SettingsInput
              value={hostUrl}
              onChange={setHostUrl}
              placeholder="https://remote.example.com"
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
                    <p className="text-xs text-low truncate">{host.baseUrl}</p>
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
