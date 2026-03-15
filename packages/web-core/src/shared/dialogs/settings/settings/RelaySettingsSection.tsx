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
  ArrowSquareOutIcon,
  ArrowsLeftRightIcon,
  BroadcastIcon,
  CheckIcon,
  CopyIcon,
  DesktopTowerIcon,
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
export function RelaySettingsSectionContent({
  initialState,
}: {
  initialState?: RelaySettingsSectionInitialState;
}) {
  const runtime = useAppRuntime();

  if (runtime === 'local') {
    return <LocalRelaySettingsSectionContent />;
  }

  return <RemoteRelaySettingsSectionContent initialState={initialState} />;
}

function RemoteAccessOverview({ runtime }: { runtime: 'local' | 'remote' }) {
  const { t } = useTranslation(['settings']);

  return (
    <div className="rounded-sm border border-border bg-gradient-to-br from-brand/10 via-panel to-secondary/50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand">
            <ArrowsLeftRightIcon className="size-icon-xs" weight="bold" />
            <span>{t('settings.relay.title')}</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-high">
              {t(
                'settings.relay.overview.title',
                'This device can participate in remote access in two roles'
              )}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-low">
              {runtime === 'local'
                ? t(
                    'settings.relay.overview.localDescription',
                    'This device can accept remote access as a host and can also pair to other hosts as a client.'
                  )
                : t(
                    'settings.relay.overview.remoteDescription',
                    'From the web, this device acts as a client. You can pair to hosts and reconnect to them here.'
                  )}
            </p>
          </div>
        </div>

        <div className="grid gap-2 md:min-w-[280px]">
          <CapabilityBadge
            icon={<DesktopTowerIcon className="size-icon-sm" weight="bold" />}
            label={t('settings.relay.overview.hostRole', 'Act as host')}
            description={
              runtime === 'local'
                ? t(
                    'settings.relay.overview.hostRoleEnabled',
                    'Other devices can pair to this device.'
                  )
                : t(
                    'settings.relay.overview.hostRoleDisabled',
                    'Host controls are only available on the local device.'
                  )
            }
            active={runtime === 'local'}
          />
          <CapabilityBadge
            icon={<ArrowSquareOutIcon className="size-icon-sm" weight="bold" />}
            label={t('settings.relay.overview.clientRole', 'Act as client')}
            description={t(
              'settings.relay.overview.clientRoleDescription',
              'This device can pair to other hosts using a one-time code.'
            )}
            active
          />
        </div>
      </div>
    </div>
  );
}

function CapabilityBadge({
  icon,
  label,
  description,
  active,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  active: boolean;
}) {
  const { t } = useTranslation(['settings']);

  return (
    <div
      className={
        active
          ? 'rounded-sm border border-brand/30 bg-panel/90 px-3 py-2'
          : 'rounded-sm border border-border bg-secondary/40 px-3 py-2'
      }
    >
      <div className="flex items-center gap-2">
        <div className={active ? 'text-brand' : 'text-low'}>{icon}</div>
        <span className="text-sm font-medium text-high">{label}</span>
        <span
          className={
            active
              ? 'ml-auto rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success'
              : 'ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-low'
          }
        >
          {active
            ? t('settings.relay.overview.available', 'Available')
            : t('settings.relay.overview.unavailable', 'Unavailable')}
        </span>
      </div>
      <p className="mt-1 text-sm text-low">{description}</p>
    </div>
  );
}

function RolePanel({
  eyebrow,
  title,
  description,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-panel/95 shadow-sm">
      <div className="border-b border-border bg-secondary/35 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-sm bg-brand/10 p-2 text-brand">
            {icon}
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-low">
              {eyebrow}
            </div>
            <h3 className="text-base font-semibold text-high">{title}</h3>
            <p className="text-sm text-low">{description}</p>
          </div>
        </div>
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </div>
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
          'Sign in to pair this device with other hosts and manage remote connections.'
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

function LocalRelaySettingsSectionContent() {
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
    <div className="space-y-6">
      <RemoteAccessOverview runtime="local" />

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

      <RolePanel
        eyebrow={t('settings.relay.host.eyebrow', 'Act as host')}
        title={t(
          'settings.relay.host.title',
          'Let other devices pair to this device'
        )}
        description={
          <>
            {t(
              'settings.relay.host.description',
              'Use these controls when this device should accept incoming remote access.'
            )}{' '}
            <a
              href={RELAY_REMOTE_CONTROL_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              {t('settings.relay.docsLink', 'Read docs')}
            </a>
          </>
        }
        icon={<BroadcastIcon className="size-icon-md" weight="bold" />}
      >
        <InlineNotice>
          {t(
            'settings.relay.host.summary',
            'Devices that pair here will see this device as a host.'
          )}
        </InlineNotice>

        <SettingsCheckbox
          id="relay-enabled"
          label={t('settings.relay.enabled.label')}
          description={t(
            'settings.relay.host.enabled.helper',
            'When enabled, this device can be paired to from the web or another device.'
          )}
          checked={draft?.relay_enabled ?? true}
          onChange={(checked) => updateDraft({ relay_enabled: checked })}
        />

        {draft?.relay_enabled && (
          <div className="space-y-3 mt-2">
            <SettingsField
              label={t('settings.relay.hostName.label', 'Host name')}
              description={t(
                'settings.relay.hostName.helper',
                'Shown when pairing from browser. Leave blank to use the default format.'
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
                      'Show pairing code for this device'
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
                        'Pairing code for this device'
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
                        'Enter this code on the client device that should connect here.'
                      )}
                    </p>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-border/70">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-normal">
                      {t(
                        'settings.relay.host.pairedClients.title',
                        'Devices paired to this host'
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
                          'Checking for new client devices'
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
                        'No devices have paired to this host yet.'
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
                    'Sign in to generate a pairing code for this device.'
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
      </RolePanel>

      <RolePanel
        eyebrow={t('settings.relay.client.eyebrow', 'Act as client')}
        title={t(
          'settings.relay.client.panelTitle',
          'Pair this device to another host'
        )}
        description={t(
          'settings.relay.client.panelDescription',
          'Use this when this device should connect outward to another host.'
        )}
        icon={<ArrowSquareOutIcon className="size-icon-md" weight="bold" />}
      >
        <InlineNotice>
          {t(
            'settings.relay.client.summary',
            'Hosts listed below are destinations that this device can connect to as a client.'
          )}
        </InlineNotice>
        <RemoteCloudHostsSettingsCardContent embedded />
      </RolePanel>

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
}: {
  initialState?: RelaySettingsSectionInitialState;
}) {
  const { t } = useTranslation(['settings']);
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return (
      <SettingsCard
        title={t('settings.relay.client.title', 'Use this device as a client')}
        description={t(
          'settings.relay.client.description',
          'Pair this device to other hosts using a one-time code, then reconnect to them from here.'
        )}
      >
        <SignInPrompt />
      </SettingsCard>
    );
  }

  return (
    <RemoteCloudHostsSettingsCardContent
      initialHostId={initialState?.hostId}
      mode="remote"
    />
  );
}

function formatDeviceLabel(device: string): string {
  if (!device) {
    return '';
  }
  return `${device[0]?.toUpperCase() ?? ''}${device.slice(1)}`;
}
