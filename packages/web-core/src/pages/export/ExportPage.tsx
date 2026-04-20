import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeMode } from 'shared/types';
import { useTheme } from '@/shared/hooks/useTheme';
import { ExportLayout } from '@/features/export/ui/ExportLayout';
import type { ExportRequest } from '@/features/export/ui/ExportDownload';
import type {
  ExportOrganization,
  ExportProject,
} from '@/features/export/ui/ExportChooseProjects';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useUserOrganizations } from '@/shared/hooks/useUserOrganizations';
import { useOrganizationProjects } from '@/shared/hooks/useOrganizationProjects';
import { makeRequest as makeRemoteRequest } from '@/shared/lib/remoteApi';
import { LoginRequiredPrompt } from '@/shared/dialogs/shared/LoginRequiredPrompt';

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
                alt="Agent Kanban"
                className="h-8 w-auto logo"
              />
            </div>
            <p className="text-sm text-low">
              Download your project and issue data to CSV files. Optionally
              downloads your file attachments too.
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

export function ExportPageContainer() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: orgsData, isLoading: orgsLoading } = useUserOrganizations();
  const organizations = useMemo<ExportOrganization[]>(
    () =>
      (orgsData?.organizations ?? []).map((organization) => ({
        id: organization.id,
        name: organization.name,
      })),
    [orgsData?.organizations]
  );
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (organizations.length === 0) {
      return;
    }

    const hasSelectedOrg = selectedOrgId
      ? organizations.some((organization) => organization.id === selectedOrgId)
      : false;

    if (!hasSelectedOrg) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId]);

  const { data: projectData = [], isLoading: projectsLoading } =
    useOrganizationProjects(selectedOrgId);
  const projects = useMemo<ExportProject[]>(
    () =>
      projectData.map((project) => ({
        id: project.id,
        name: project.name,
      })),
    [projectData]
  );

  const exportFn = useCallback(async (request: ExportRequest) => {
    return makeRemoteRequest('/v1/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-primary">
        <p className="text-sm text-low">Loading...</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-primary p-base">
        <LoginRequiredPrompt
          className="max-w-md"
          title="Sign in to export your cloud data"
          description="Sign in to choose the organizations and projects available to your account."
          actionLabel="Sign in"
        />
      </div>
    );
  }

  return (
    <ExportPage
      exportFn={exportFn}
      organizations={organizations}
      orgsLoading={orgsLoading}
      projects={projects}
      projectsLoading={projectsLoading}
      selectedOrgId={selectedOrgId}
      onOrgChange={setSelectedOrgId}
    />
  );
}
