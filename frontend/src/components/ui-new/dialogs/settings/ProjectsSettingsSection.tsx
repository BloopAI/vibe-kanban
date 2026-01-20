import { useTranslation } from 'react-i18next';
import { FolderIcon } from '@phosphor-icons/react';

export function ProjectsSettingsSection() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FolderIcon className="size-icon-lg text-brand" weight="duotone" />
        <div>
          <h2 className="text-lg font-semibold text-high">
            {t('settings.layout.nav.projects')}
          </h2>
          <p className="text-sm text-low">
            {t('settings.layout.nav.projectsDesc')}
          </p>
        </div>
      </div>

      <div className="bg-secondary/50 border border-border/50 rounded-sm p-8 text-center">
        <p className="text-normal">
          Project settings will be available here.
        </p>
        <p className="text-sm text-low mt-2">
          Configure project-specific settings, defaults, and preferences.
        </p>
      </div>
    </div>
  );
}
