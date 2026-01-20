import { useTranslation } from 'react-i18next';

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
}

export function SettingsSection({ type }: SettingsSectionProps) {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-border">
        <h2 className="text-lg font-semibold text-high">
          {t(`settings.layout.nav.${type}`)}
        </h2>
      </div>

      {/* Content */}
      {renderContent()}
    </div>
  );
}
