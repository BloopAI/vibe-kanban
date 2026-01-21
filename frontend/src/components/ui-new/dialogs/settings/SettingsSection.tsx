import { useTranslation } from 'react-i18next';
import { XIcon } from '@phosphor-icons/react';

import { GeneralSettingsSectionContent } from './GeneralSettingsSection';
import { ProjectsSettingsSectionContent } from './ProjectsSettingsSection';
import { ReposSettingsSectionContent } from './ReposSettingsSection';
import { OrganizationsSettingsSectionContent } from './OrganizationsSettingsSection';
import { AgentsSettingsSectionContent } from './AgentsSettingsSection';
import { McpSettingsSectionContent } from './McpSettingsSection';

export type SettingsSectionType =
  | 'general'
  | 'projects'
  | 'repos'
  | 'organizations'
  | 'agents'
  | 'mcp';

interface SettingsSectionProps {
  type: SettingsSectionType;
  onClose?: () => void;
}

export function SettingsSection({ type, onClose }: SettingsSectionProps) {
  const { t } = useTranslation('settings');

  const renderContent = () => {
    switch (type) {
      case 'general':
        return <GeneralSettingsSectionContent />;
      case 'projects':
        return <ProjectsSettingsSectionContent />;
      case 'repos':
        return <ReposSettingsSectionContent />;
      case 'organizations':
        return <OrganizationsSettingsSectionContent />;
      case 'agents':
        return <AgentsSettingsSectionContent />;
      case 'mcp':
        return <McpSettingsSectionContent />;
      default:
        return <GeneralSettingsSectionContent />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - sticky */}
      <div className="p-4 border-b border-border bg-panel/95 backdrop-blur-sm hidden sm:flex items-center justify-between">
        <h2 className="text-lg font-semibold text-high">
          {t(`settings.layout.nav.${type}`)}
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 ring-offset-panel transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          >
            <XIcon className="h-4 w-4 text-normal" weight="bold" />
            <span className="sr-only">{t('close', { ns: 'common' })}</span>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="space-y-6 px-6 pt-4 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
}
