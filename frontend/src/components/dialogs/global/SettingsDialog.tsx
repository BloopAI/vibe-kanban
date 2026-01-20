import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Settings,
  Cpu,
  Server,
  FolderOpen,
  Building2,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/lib/modals';
import { ScrollArea } from '@/components/ui/scroll-area';

// Settings section components
import { GeneralSettingsSection } from './settings/GeneralSettingsSection';
import { AgentSettingsSection } from './settings/AgentSettingsSection';
import { McpSettingsSection } from './settings/McpSettingsSection';
import { ProjectSettingsSection } from './settings/ProjectSettingsSection';
import { ReposSettingsSection } from './settings/ReposSettingsSection';
import { OrganizationSettingsSection } from './settings/OrganizationSettingsSection';

type SettingsSection =
  | 'general'
  | 'projects'
  | 'repos'
  | 'organizations'
  | 'agents'
  | 'mcp';

const settingsNavigation: {
  id: SettingsSection;
  icon: typeof Settings;
}[] = [
  { id: 'general', icon: Settings },
  { id: 'projects', icon: FolderOpen },
  { id: 'repos', icon: GitBranch },
  { id: 'organizations', icon: Building2 },
  { id: 'agents', icon: Cpu },
  { id: 'mcp', icon: Server },
];

export interface SettingsDialogProps {
  initialSection?: SettingsSection;
}

const SettingsDialogImpl = NiceModal.create<SettingsDialogProps>(
  ({ initialSection }) => {
    const modal = useModal();
    const { t } = useTranslation('settings');
    const [activeSection, setActiveSection] = useState<SettingsSection>(
      initialSection || 'general'
    );

    const handleClose = () => {
      modal.resolve();
      modal.hide();
    };

    const renderSectionContent = () => {
      switch (activeSection) {
        case 'general':
          return <GeneralSettingsSection />;
        case 'projects':
          return <ProjectSettingsSection />;
        case 'repos':
          return <ReposSettingsSection />;
        case 'organizations':
          return <OrganizationSettingsSection />;
        case 'agents':
          return <AgentSettingsSection />;
        case 'mcp':
          return <McpSettingsSection />;
        default:
          return <GeneralSettingsSection />;
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[900px] h-[80vh] max-h-[700px] p-0 overflow-hidden">
          <div className="flex h-full">
            {/* Left sidebar navigation */}
            <div className="w-56 border-r bg-secondary/30 flex flex-col">
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-lg">
                  {t('settings.layout.nav.title')}
                </DialogTitle>
              </DialogHeader>
              <nav className="flex-1 p-2 space-y-1">
                {settingsNavigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <Button
                      key={item.id}
                      variant="ghost"
                      className={cn(
                        'w-full justify-start gap-3 px-3 py-2 h-auto',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => setActiveSection(item.id)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="font-medium text-sm">
                          {t(`settings.layout.nav.${item.id}`)}
                        </div>
                        <div className="text-xs opacity-70 truncate">
                          {t(`settings.layout.nav.${item.id}Desc`)}
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </nav>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0">
              <ScrollArea className="flex-1">
                <div className="p-6">{renderSectionContent()}</div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export const SettingsDialog = defineModal<SettingsDialogProps | void, void>(
  SettingsDialogImpl
);
