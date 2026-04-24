import { useCallback } from 'react';
import { ArrowSquareOutIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { usePageTitle } from '@/shared/hooks/usePageTitle';

interface ProjectSunsetPageProps {
  projectName?: string;
}

export function ProjectSunsetPage({ projectName }: ProjectSunsetPageProps) {
  const appNavigation = useAppNavigation();

  usePageTitle(projectName, 'Project retired');

  const handleExportClick = useCallback(() => {
    appNavigation.goToExport();
  }, [appNavigation]);

  return (
    <div className="h-full w-full overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-3xl items-center px-base py-double">
        <div className="w-full rounded-sm border border-border bg-secondary p-double">
          <div className="space-y-base">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-low">
              Project sunset
            </p>
            <div className="space-y-half">
              <h1 className="text-2xl font-semibold text-high">
                Project functionality has been retired
              </h1>
              <p className="text-sm text-low">
                {projectName
                  ? `"${projectName}" is now export-only.`
                  : 'This project is now export-only.'}{' '}
                You can still download your project and issue data, but kanban,
                issue, and workspace flows are no longer available here.
              </p>
            </div>
            <div className="flex flex-col gap-half sm:flex-row">
              <button
                type="button"
                onClick={handleExportClick}
                className="inline-flex items-center justify-center gap-2 rounded-sm bg-brand px-base py-half text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
              >
                <DownloadSimpleIcon className="size-icon-base" weight="bold" />
                Export data
              </button>
              <a
                href="https://vibekanban.com/shutdown"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-sm border border-border bg-primary px-base py-half text-sm font-medium text-normal transition-colors hover:bg-tertiary"
              >
                <ArrowSquareOutIcon className="size-icon-base" weight="bold" />
                Read about the shutdown
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
