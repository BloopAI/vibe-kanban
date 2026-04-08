import { ThemeMode } from 'shared/types';
import { useTheme } from '@/shared/hooks/useTheme';
import { ExportLayout } from '@/features/export/ui/ExportLayout';
import type { ExportRequest } from '@/features/export/ui/ExportDownload';
import type {
  ExportOrganization,
  ExportProject,
} from '@/features/export/ui/ExportChooseProjects';

function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === ThemeMode.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme === ThemeMode.DARK ? 'dark' : 'light';
}

interface ExportPageProps {
  exportFn: (request: ExportRequest) => Promise<Response>;
  organizations: ExportOrganization[];
  orgsLoading: boolean;
  projects: ExportProject[];
  projectsLoading: boolean;
  selectedOrgId: string | null;
  onOrgChange: (orgId: string) => void;
}

export function ExportPage({
  exportFn,
  organizations,
  orgsLoading,
  projects,
  projectsLoading,
  selectedOrgId,
  onOrgChange,
}: ExportPageProps) {
  const { theme } = useTheme();

  const logoSrc =
    resolveTheme(theme) === 'dark'
      ? '/vibe-kanban-logo-dark.svg'
      : '/vibe-kanban-logo.svg';

  return (
    <div className="h-full overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-base py-double">
        <div className="rounded-sm border border-border bg-secondary p-double space-y-double">
          <header className="space-y-double text-center">
            <div className="flex justify-center">
              <img
                src={logoSrc}
                alt="Vibe Kanban"
                className="h-8 w-auto logo"
              />
            </div>
            <p className="text-sm text-low">
              Export your cloud data before the service shuts down.
            </p>
          </header>
          <ExportLayout
            exportFn={exportFn}
            organizations={organizations}
            orgsLoading={orgsLoading}
            projects={projects}
            projectsLoading={projectsLoading}
            selectedOrgId={selectedOrgId}
            onOrgChange={onOrgChange}
          />
        </div>
      </div>
    </div>
  );
}
