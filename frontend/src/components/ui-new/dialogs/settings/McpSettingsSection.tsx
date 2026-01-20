import { useTranslation } from 'react-i18next';
import { PlugIcon } from '@phosphor-icons/react';

export function McpSettingsSection() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PlugIcon className="size-icon-lg text-brand" weight="duotone" />
        <div>
          <h2 className="text-lg font-semibold text-high">
            {t('settings.layout.nav.mcp')}
          </h2>
          <p className="text-sm text-low">
            {t('settings.layout.nav.mcpDesc')}
          </p>
        </div>
      </div>

      <div className="bg-secondary/50 border border-border/50 rounded-sm p-8 text-center">
        <p className="text-normal">
          MCP (Model Context Protocol) settings will be available here.
        </p>
        <p className="text-sm text-low mt-2">
          Configure MCP servers, tools, and integration preferences.
        </p>
      </div>
    </div>
  );
}
