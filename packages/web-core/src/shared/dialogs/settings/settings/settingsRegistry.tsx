import {
  GearIcon,
  GitBranchIcon,
  CpuIcon,
  PlugIcon,
  BroadcastIcon,
  HardDrivesIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { GeneralSettingsSection } from './GeneralSettingsSection';
import { ReposSettingsSection } from './ReposSettingsSection';
import { AgentsSettingsSection } from './AgentsSettingsSection';
import { McpSettingsSection } from './McpSettingsSection';
import { RelaySettingsSectionContent } from './RelaySettingsSection';
import { RemoteHostsSettingsSection } from './RemoteHostsSettingsSection';

export type SettingsSectionType =
  | 'general'
  | 'repos'
  | 'agents'
  | 'mcp'
  | 'relay'
  | 'remote-hosts';

export type SettingsSectionGroup = 'host' | 'universal';

export type SettingsSectionInitialState = {
  general: undefined;
  repos: { repoId?: string } | undefined;
  agents: { executor?: string; variant?: string } | undefined;
  mcp: undefined;
  relay: { hostId?: string } | undefined;
  'remote-hosts': undefined;
};

export interface SettingsSectionDefinition {
  id: SettingsSectionType;
  icon: Icon;
  group: SettingsSectionGroup;
}

export const SETTINGS_SECTION_DEFINITIONS: SettingsSectionDefinition[] = [
  { id: 'general', icon: GearIcon, group: 'host' },
  { id: 'repos', icon: GitBranchIcon, group: 'host' },
  { id: 'agents', icon: CpuIcon, group: 'host' },
  { id: 'mcp', icon: PlugIcon, group: 'host' },
  { id: 'relay', icon: BroadcastIcon, group: 'universal' },
  { id: 'remote-hosts', icon: HardDrivesIcon, group: 'universal' },
];

export function isHostSpecificSettingsSection(
  type: SettingsSectionType
): boolean {
  return (
    SETTINGS_SECTION_DEFINITIONS.find((section) => section.id === type)
      ?.group === 'host'
  );
}

export function renderSettingsSection(
  type: SettingsSectionType,
  initialState?: SettingsSectionInitialState[SettingsSectionType],
  onClose?: () => void
) {
  switch (type) {
    case 'general':
      return <GeneralSettingsSection />;
    case 'repos':
      return (
        <ReposSettingsSection
          initialState={initialState as SettingsSectionInitialState['repos']}
        />
      );
    case 'agents':
      return <AgentsSettingsSection />;
    case 'mcp':
      return <McpSettingsSection />;
    case 'relay':
      return (
        <RelaySettingsSectionContent
          initialState={initialState as SettingsSectionInitialState['relay']}
          onClose={onClose}
        />
      );
    case 'remote-hosts':
      return <RemoteHostsSettingsSection />;
    default:
      return <GeneralSettingsSection />;
  }
}
