import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  XIcon,
  GearIcon,
  FolderIcon,
  GitBranchIcon,
  BuildingsIcon,
  CpuIcon,
  PlugIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import { cn } from '@/lib/utils';

// Settings section components
import { GeneralSettingsSection } from './settings/GeneralSettingsSection';
import { ProjectsSettingsSection } from './settings/ProjectsSettingsSection';
import { ReposSettingsSection } from './settings/ReposSettingsSection';
import { OrganizationsSettingsSection } from './settings/OrganizationsSettingsSection';
import { AgentsSettingsSection } from './settings/AgentsSettingsSection';
import { McpSettingsSection } from './settings/McpSettingsSection';

type SettingsSection =
  | 'general'
  | 'projects'
  | 'repos'
  | 'organizations'
  | 'agents'
  | 'mcp';

const SETTINGS_SECTIONS: {
  id: SettingsSection;
  icon: Icon;
}[] = [
  { id: 'general', icon: GearIcon },
  { id: 'projects', icon: FolderIcon },
  { id: 'repos', icon: GitBranchIcon },
  { id: 'organizations', icon: BuildingsIcon },
  { id: 'agents', icon: CpuIcon },
  { id: 'mcp', icon: PlugIcon },
];

export interface SettingsDialogProps {
  initialSection?: SettingsSection;
}

const SettingsDialogImpl = NiceModal.create<SettingsDialogProps>(
  ({ initialSection }) => {
    const modal = useModal();
    const container = usePortalContainer();
    const { t } = useTranslation('settings');
    const [activeSection, setActiveSection] = useState<SettingsSection>(
      initialSection || 'general'
    );

    const handleClose = useCallback(() => {
      modal.hide();
      modal.resolve();
      modal.remove();
    }, [modal]);

    // Handle ESC key
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleClose]);

    const renderSectionContent = () => {
      switch (activeSection) {
        case 'general':
          return <GeneralSettingsSection />;
        case 'projects':
          return <ProjectsSettingsSection />;
        case 'repos':
          return <ReposSettingsSection />;
        case 'organizations':
          return <OrganizationsSettingsSection />;
        case 'agents':
          return <AgentsSettingsSection />;
        case 'mcp':
          return <McpSettingsSection />;
        default:
          return <GeneralSettingsSection />;
      }
    };

    if (!container) return null;

    return createPortal(
      <>
        {/* Overlay */}
        <div
          className="fixed inset-0 z-[9998] bg-black/50 animate-in fade-in-0 duration-200"
          onClick={handleClose}
        />
        {/* Dialog wrapper - handles positioning */}
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999]">
          {/* Dialog content - handles animation */}
          <div
            className={cn(
              'w-[900px] h-[700px] flex rounded-sm overflow-hidden',
              'bg-panel/95 backdrop-blur-sm border border-border/50 shadow-lg',
              'animate-in fade-in-0 slide-in-from-bottom-4 duration-200'
            )}
          >
            {/* Sidebar */}
            <div className="w-56 bg-secondary/80 border-r border-border/50 flex flex-col">
              {/* Header */}
              <div className="p-4 border-b border-border/50">
                <h2 className="text-lg font-semibold text-high">
                  {t('settings.layout.nav.title')}
                </h2>
              </div>
              {/* Navigation */}
              <nav className="flex-1 p-2 flex flex-col gap-1 overflow-y-auto">
                {SETTINGS_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={cn(
                        'flex items-center gap-3 text-left px-3 py-2 rounded-sm text-sm transition-colors',
                        isActive
                          ? 'bg-brand/10 text-brand font-medium'
                          : 'text-normal hover:bg-primary/10'
                      )}
                    >
                      <Icon className="size-icon-sm shrink-0" weight="bold" />
                      <span className="truncate">
                        {t(`settings.layout.nav.${section.id}`)}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
            {/* Content */}
            <div className="flex-1 flex flex-col relative overflow-hidden">
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-panel transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
              >
                <XIcon className="h-4 w-4 text-normal" weight="bold" />
                <span className="sr-only">{t('close', { ns: 'common' })}</span>
              </button>
              {/* Section content */}
              <div className="flex-1 overflow-y-auto p-6">
                {renderSectionContent()}
              </div>
            </div>
          </div>
        </div>
      </>,
      container
    );
  }
);

export const SettingsDialog = defineModal<SettingsDialogProps | void, void>(
  SettingsDialogImpl
);
