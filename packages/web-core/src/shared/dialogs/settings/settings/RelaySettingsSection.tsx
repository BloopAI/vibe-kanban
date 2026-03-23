import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cloneDeep, isEqual, merge } from 'lodash';
import {
  BroadcastIcon,
  CheckIcon,
  CopyIcon,
  DesktopIcon,
  SignInIcon,
  SpinnerIcon,
} from '@phosphor-icons/react';
import { OAuthDialog } from '@/shared/dialogs/global/OAuthDialog';
import { useAppRuntime } from '@/shared/hooks/useAppRuntime';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { relayApi } from '@/shared/lib/api';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import {
  SettingsCard,
  SettingsCheckbox,
  SettingsField,
  SettingsInput,
  SettingsSaveBar,
} from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';
import { RemoteCloudHostsSettingsCardContent } from './RemoteCloudHostsSettingsCard';

const RELAY_PAIRED_CLIENTS_QUERY_KEY = ['relay', 'paired-clients'] as const;
const RELAY_REMOTE_CONTROL_DOCS_URL =
  'https://www.vibekanban.com/docs/remote-control';

interface RelaySettingsSectionInitialState {
  hostId?: string;
}

type RelayRole = 'host' | 'client';

export function RelaySettingsSectionContent({
  initialState,
  onClose,
}: {
  initialState?: RelaySettingsSectionInitialState;
  onClose?: () => void;
}) {
  const runtime = useAppRuntime();

  if (runtime === 'local') {
    return <LocalRelaySettingsSectionContent onClose={onClose} />;
  }

  return (
    <RemoteRelaySettingsSectionContent
      initialState={initialState}
      onClose={onClose}
    />
  );
}

function RelayRoleChooser({
  selectedRole,
  onSelect,
}: {
  selectedRole: RelayRole | null;
  onSelect: (role: RelayRole) => void;
}) {
  const { t } = useTranslation(['settings']);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <RelayRoleChoice
        role="host"
        selected={selectedRole === 'host'}
        icon={<BroadcastIcon className="size-icon-sm" weight="bold" />}
        label={t('settings.relay.host.label', 'Host')}
        description={t(
          'settings.relay.host.description',
          'Allow other devices to remotely control workspaces on this machine.'
        )}
        onSelect={onSelect}
      />
      <RelayRoleChoice
        role="client"
        selected={selectedRole === 'client'}
        icon={<DesktopIcon className="size-icon-sm" weight="bold" />}
        label={t('settings.relay.client.label', 'Client')}
        description={t(
          'settings.relay.client.panelDescription',
          'Control workspaces on another device by pairing to it with a one-time code.'
        )}
        onSelect={onSelect}
      />
    </div>
  );
}

function RelayRoleChoice({
  role,
  selected,
  icon,
  label,
  description,
  onSelect,
}: {
  role: RelayRole;
  selected: boolean;
  icon: ReactNode;
  label: string;
  description: string;
  onSelect: (role: RelayRole) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(role)}
      className={
        selected
          ? 'flex w-full flex-col items-start gap-2 rounded-sm border border-brand/40 bg-brand/10 p-4 text-left transition-colors'
          : 'flex w-full flex-col items-start gap-2 rounded-sm border border-border bg-panel p-4 text-left transition-colors hover:border-brand/30 hover:bg-secondary/20'
      }
    >
      <div
        className={
          selected
            ? 'rounded-sm bg-brand/15 p-1.5 text-brand'
            : 'rounded-sm bg-panel p-1.5 text-low'
        }
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-high">{label}</div>
        <div className="mt-0.5 text-xs text-low">{description}</div>
      </div>
    </button>
  );
}

function InlineNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  const className =
    tone === 'error'
      ? 'bg-error/10 border-error/50 text-error'
      : tone === 'success'
        ? 'bg-success/10 border-success/50 text-success'
        : 'bg-secondary/40 border-border text-low';

  return (
    <div className={`rounded-sm border p-3 text-sm ${className}`}>
      {children}
    </div>
  );
}

function SignInPrompt() {
  const { t } = useTranslation(['settings', 'common']);

  return (
    <div className="space-y-3">
      <InlineNotice>
        {t(
          'settings.relay.signInRequired',
          'Sign in to pair and manage remote connections.'
        )}
      </InlineNotice>
      <PrimaryButton
        variant="secondary"
        value={t('settings.remoteProjects.loginRequired.action', 'Sign in')}
        onClick={() => void OAuthDialog.show({})}
      >
        <SignInIcon className="size-icon-xs mr-1" weight="bold" />
      </PrimaryButton>
    </div>
  );
}

function LocalRelaySettingsSectionContent({
  onClose,
}: {
  onClose?: () => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const { setDirty: setContextDirty } = useSettingsDirty();
  const userSystem = useUserSystem();
  const { config, loading, updateAndSaveConfig } = userSystem;
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState(() => (config ? cloneDeep(config) : null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [enrollmentCode, setEnrollmentCode] = useState<string | null>(null);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [removingClientId, setRemovingClientId] = useState<string | null>(null);
  const [enrollmentCodeCopied, setEnrollmentCodeCopied] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RelayRole | null>(null);

  const {
    data: pairedClients = [],
    isLoading: pairedClientsLoading,
    error: pairedClientsError,
  } = useQuery({
    queryKey: RELAY_PAIRED_CLIENTS_QUERY_KEY,
    queryFn: () => relayApi.listPairedClients(),
    enabled: isSignedIn && (draft?.relay_enabled ?? false),
    refetchInterval: 10000,
  });

  const removePairedClientMutation = useMutation({
    mutationFn: (clientId: string) => relayApi.removePairedClient(clientId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: RELAY_PAIRED_CLIENTS_QUERY_KEY,
      });
    },
  });

  useEffect(() => {
    if (!config) return;
    if (!dirty) {
      setDraft(cloneDeep(config));
    }
  }, [config, dirty]);

  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !config) return false;
    return !isEqual(draft, config);
  }, [draft, config]);

  useEffect(() => {
    setContextDirty('relay', hasUnsavedChanges);
    return () => setContextDirty('relay', false);
  }, [hasUnsavedChanges, setContextDirty]);

  const updateDraft = useCallback(
    (patch: Partial<typeof config>) => {
      setDraft((prev: typeof config) => {
        if (!prev) return prev;
        const next = merge({}, prev, patch);
        if (!isEqual(next, config)) {
          setDirty(true);
        }
        return next;
      });
    },
    [config]
  );

  const handleSave = async () => {
    if (!draft) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateAndSaveConfig(draft);
      setDirty(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError(t('settings.general.save.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!config) return;
    setDraft(cloneDeep(config));
    setDirty(false);
  };

  const handleShowEnrollmentCode = async () => {
    setEnrollmentLoading(true);
    setEnrollmentError(null);
    try {
      const result = await relayApi.getEnrollmentCode();
      setEnrollmentCode(result.enrollment_code);
    } catch {
      setEnrollmentError(t('settings.relay.enrollmentCode.fetchError'));
    } finally {
      setEnrollmentLoading(false);
    }
  };

  const handleRemovePairedClient = async (clientId: string) => {
    setRemovingClientId(clientId);
    try {
      await removePairedClientMutation.mutateAsync(clientId);
    } finally {
      setRemovingClientId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">{t('settings.general.loading')}</span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="py-8">
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {t('settings.general.loadError')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <RelayRoleChooser
        selectedRole={selectedRole}
        onSelect={(role) => setSelectedRole(role)}
      />

      {error && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium">
          {t('settings.general.save.success')}
        </div>
      )}

      {selectedRole === 'host' && (
        <SettingsCard
          title={t('settings.relay.host.title', 'Accept incoming connections')}
          headerAction={
            <a
              href={RELAY_REMOTE_CONTROL_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand hover:underline"
            >
              {t('settings.relay.docsLink', 'Read docs')}
            </a>
          }
        >
          <SettingsCheckbox
            id="relay-enabled"
            label={t('settings.relay.enabled.label')}
            description={t(
              'settings.relay.host.enabled.helper',
              'Allow incoming remote connections to this device.'
            )}
            checked={draft?.relay_enabled ?? true}
            onChange={(checked) => updateDraft({ relay_enabled: checked })}
          />

          {draft?.relay_enabled && (
            <div className="mt-2 space-y-3">
              <SettingsField
                label={t('settings.relay.hostName.label', 'Display name')}
                description={t(
                  'settings.relay.hostName.helper',
                  'How this device appears when pairing. Leave blank for the default.'
                )}
              >
                <SettingsInput
                  value={draft.host_nickname ?? ''}
                  onChange={(value) =>
                    updateDraft({
                      host_nickname: value === '' ? null : value,
                    })
                  }
                  placeholder={t(
                    'settings.relay.hostName.placeholder',
                    '<os_type> host (<user_id>)'
                  )}
                />
              </SettingsField>

              {isSignedIn ? (
                <>
                  {!enrollmentCode && (
                    <PrimaryButton
                      variant="secondary"
                      value={t(
                        'settings.relay.host.enrollmentCode.show',
                        'Generate pairing code'
                      )}
                      onClick={handleShowEnrollmentCode}
                      disabled={enrollmentLoading}
                      actionIcon={enrollmentLoading ? 'spinner' : undefined}
                    />
                  )}

                  {enrollmentError && (
                    <p className="text-sm text-error">{enrollmentError}</p>
                  )}

                  {enrollmentCode && (
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-normal">
                        {t(
                          'settings.relay.host.enrollmentCode.label',
                          'Pairing code'
                        )}
                      </label>
                      <div className="relative bg-secondary border border-border rounded-sm px-base py-half font-mono text-lg text-high tracking-widest select-all pr-10">
                        {enrollmentCode}
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(enrollmentCode);
                            setEnrollmentCodeCopied(true);
                            setTimeout(
                              () => setEnrollmentCodeCopied(false),
                              2000
                            );
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-low hover:text-normal transition-colors rounded-sm"
                          aria-label={t(
                            'settings.relay.enrollmentCode.copy',
                            'Copy code'
                          )}
                        >
                          {enrollmentCodeCopied ? (
                            <CheckIcon
                              className="size-icon-sm text-success"
                              weight="bold"
                            />
                          ) : (
                            <CopyIcon className="size-icon-sm" weight="bold" />
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-low">
                        {t(
                          'settings.relay.host.enrollmentCode.helper',
                          'Enter this code on the device you want to connect from.'
                        )}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2 pt-2 border-t border-border/70">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-medium text-normal">
                        {t(
                          'settings.relay.host.pairedClients.title',
                          'Paired devices'
                        )}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-low">
                        <SpinnerIcon
                          className="size-icon-xs animate-spin"
                          weight="bold"
                        />
                        <span>
                          {t(
                            'settings.relay.host.pairedClients.checking',
                            'Polling for changes'
                          )}
                        </span>
                      </div>
                    </div>

                    {pairedClientsLoading && (
                      <div className="flex items-center gap-2 text-sm text-low">
                        <SpinnerIcon
                          className="size-icon-sm animate-spin"
                          weight="bold"
                        />
                        <span>
                          {t(
                            'settings.relay.host.pairedClients.loading',
                            'Loading paired client devices...'
                          )}
                        </span>
                      </div>
                    )}

                    {pairedClientsError instanceof Error && (
                      <p className="text-sm text-error">
                        {pairedClientsError.message}
                      </p>
                    )}

                    {removePairedClientMutation.error instanceof Error && (
                      <p className="text-sm text-error">
                        {removePairedClientMutation.error.message}
                      </p>
                    )}

                    {!pairedClientsLoading && pairedClients.length === 0 && (
                      <div className="rounded-sm border border-border bg-secondary/30 p-3 text-sm text-low">
                        {t(
                          'settings.relay.host.pairedClients.empty',
                          'No devices paired yet.'
                        )}
                      </div>
                    )}

                    {!pairedClientsLoading && pairedClients.length > 0 && (
                      <div className="space-y-2">
                        {pairedClients.map((client) => (
                          <div
                            key={client.client_id}
                            className="rounded-sm border border-border bg-secondary/30 p-3 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-high truncate">
                                {client.client_name}
                              </p>
                              <p className="text-xs text-low">
                                {client.client_browser} · {client.client_os} ·{' '}
                                {formatDeviceLabel(client.client_device)}
                              </p>
                            </div>
                            <PrimaryButton
                              variant="tertiary"
                              value={t(
                                'settings.relay.host.pairedClients.remove',
                                'Remove'
                              )}
                              onClick={() =>
                                void handleRemovePairedClient(client.client_id)
                              }
                              disabled={
                                removePairedClientMutation.isPending &&
                                removingClientId === client.client_id
                              }
                              actionIcon={
                                removePairedClientMutation.isPending &&
                                removingClientId === client.client_id
                                  ? 'spinner'
                                  : undefined
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-low">
                    {t(
                      'settings.relay.host.enrollmentCode.loginRequired',
                      'Sign in to generate a pairing code.'
                    )}
                  </p>
                  <PrimaryButton
                    variant="secondary"
                    value={t(
                      'settings.remoteProjects.loginRequired.action',
                      'Sign in'
                    )}
                    onClick={() => void OAuthDialog.show({})}
                  >
                    <SignInIcon className="size-icon-xs mr-1" weight="bold" />
                  </PrimaryButton>
                </div>
              )}
            </div>
          )}
        </SettingsCard>
      )}

      {selectedRole === 'client' && (
        <SettingsCard
          title={t('settings.relay.client.panelTitle', 'Connect to a host')}
          headerAction={
            <a
              href={RELAY_REMOTE_CONTROL_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand hover:underline"
            >
              {t('settings.relay.docsLink', 'Read docs')}
            </a>
          }
        >
          {isSignedIn ? (
            <RemoteCloudHostsSettingsCardContent onClose={onClose} />
          ) : (
            <SignInPrompt />
          )}
        </SettingsCard>
      )}

      <SettingsSaveBar
        show={hasUnsavedChanges}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}

function RemoteRelaySettingsSectionContent({
  initialState,
  onClose,
}: {
  initialState?: RelaySettingsSectionInitialState;
  onClose?: () => void;
}) {
  const { t } = useTranslation(['settings']);
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return (
      <SettingsCard
        title={t('settings.relay.client.title', 'Connect to a host')}
        description={t(
          'settings.relay.client.description',
          'Control workspaces on another device by pairing to it with a one-time code.'
        )}
      >
        <SignInPrompt />
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title={t('settings.relay.client.panelTitle', 'Connect to a host')}
      description={t(
        'settings.relay.client.panelDescription',
        'Control workspaces on another device by pairing to it with a one-time code.'
      )}
      headerAction={
        <a
          href={RELAY_REMOTE_CONTROL_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-brand hover:underline"
        >
          {t('settings.relay.docsLink', 'Read docs')}
        </a>
      }
    >
      <RemoteCloudHostsSettingsCardContent
        initialHostId={initialState?.hostId}
        mode="remote"
        onClose={onClose}
      />
    </SettingsCard>
  );
}

function formatDeviceLabel(device: string): string {
  if (!device) {
    return '';
  }
  return `${device[0]?.toUpperCase() ?? ''}${device.slice(1)}`;
}
