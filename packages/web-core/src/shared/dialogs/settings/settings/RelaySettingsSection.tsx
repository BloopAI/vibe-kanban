import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cloneDeep, isEqual, merge } from 'lodash';
import { SignInIcon, SpinnerIcon } from '@phosphor-icons/react';
import { OAuthDialog } from '@/shared/dialogs/global/OAuthDialog';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { relayApi } from '@/shared/lib/api';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import {
  SettingsCard,
  SettingsCheckbox,
  SettingsSaveBar,
} from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';

export function RelaySettingsSectionContent() {
  const { t } = useTranslation(['settings', 'common']);
  const { setDirty: setContextDirty } = useSettingsDirty();
  const { config, loading, updateAndSaveConfig } = useUserSystem();
  const { isSignedIn } = useAuth();

  const [draft, setDraft] = useState(() => (config ? cloneDeep(config) : null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [enrollmentCode, setEnrollmentCode] = useState<string | null>(null);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

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
    <>
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

      <SettingsCard
        title={t('settings.relay.title')}
        description={t('settings.relay.description')}
      >
        <SettingsCheckbox
          id="relay-enabled"
          label={t('settings.relay.enabled.label')}
          description={t('settings.relay.enabled.helper')}
          checked={draft?.relay_enabled ?? true}
          onChange={(checked) => updateDraft({ relay_enabled: checked })}
        />

        {draft?.relay_enabled && (
          <div className="space-y-3 mt-2">
            {isSignedIn ? (
              <>
                {!enrollmentCode && (
                  <PrimaryButton
                    variant="secondary"
                    value={t('settings.relay.enrollmentCode.show')}
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
                      {t('settings.relay.enrollmentCode.label')}
                    </label>
                    <div className="bg-secondary border border-border rounded-sm px-base py-half font-mono text-lg text-high tracking-widest select-all">
                      {enrollmentCode}
                    </div>
                    <p className="text-sm text-low">
                      {t('settings.relay.enrollmentCode.helper')}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-low">
                  {t('settings.relay.enrollmentCode.loginRequired')}
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

      <SettingsSaveBar
        show={hasUnsavedChanges}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
}
