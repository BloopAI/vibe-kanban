import { useTranslation } from 'react-i18next';
import { GitBranchIcon } from '@phosphor-icons/react';

export function ReposSettingsSection() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GitBranchIcon className="size-icon-lg text-brand" weight="duotone" />
        <div>
          <h2 className="text-lg font-semibold text-high">
            {t('settings.layout.nav.repos')}
          </h2>
          <p className="text-sm text-low">
            {t('settings.layout.nav.reposDesc')}
          </p>
        </div>
      </div>

      <div className="bg-secondary/50 border border-border/50 rounded-sm p-8 text-center">
        <p className="text-normal">
          Repository settings will be available here.
        </p>
        <p className="text-sm text-low mt-2">
          Manage repository connections, credentials, and sync preferences.
        </p>
      </div>
    </div>
  );
}
