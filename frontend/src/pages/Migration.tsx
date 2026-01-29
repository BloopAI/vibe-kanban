import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useProjects } from '@/hooks/useProjects';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { migrationApi } from '@/lib/api';
import type { MigrationReport } from 'shared/types';

export function Migration() {
  const { projects, isLoading: projectsLoading } = useProjects();
  const { data: orgsData, isLoading: orgsLoading } = useUserOrganizations();
  const organizations = orgsData?.organizations ?? [];

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    new Set()
  );
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);

  const handleToggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedProjectIds.size === projects.length) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleStartMigration = async () => {
    if (!selectedOrgId || selectedProjectIds.size === 0) return;

    setMigrating(true);
    setError(null);
    setReport(null);

    try {
      const response = await migrationApi.start({
        organization_id: selectedOrgId,
        project_ids: Array.from(selectedProjectIds),
      });
      setReport(response.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setMigrating(false);
    }
  };

  const isLoading = projectsLoading || orgsLoading;

  if (isLoading) {
    return (
      <div className="container py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Data Migration</h1>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {report && (
        <Alert className="mb-6" variant="default">
          <AlertTitle>Migration Complete</AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-1 text-sm">
              <div>
                Projects: {report.projects.migrated}/{report.projects.total}{' '}
                migrated
                {report.projects.skipped > 0 &&
                  `, ${report.projects.skipped} skipped`}
              </div>
              <div>
                Tasks: {report.tasks.migrated}/{report.tasks.total} migrated
                {report.tasks.skipped > 0 &&
                  `, ${report.tasks.skipped} skipped`}
              </div>
              <div>
                PR Merges: {report.pr_merges.migrated}/{report.pr_merges.total}{' '}
                migrated
                {report.pr_merges.skipped > 0 &&
                  `, ${report.pr_merges.skipped} skipped`}
              </div>
              {report.warnings.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Warnings:</div>
                  <ul className="list-disc list-inside">
                    {report.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Target Organization</CardTitle>
          <CardDescription>
            Select the remote organization to migrate data to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No organizations available. Please sign in and create an
              organization first.
            </p>
          ) : (
            <Select
              value={selectedOrgId ?? undefined}
              onValueChange={setSelectedOrgId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Projects to Migrate</CardTitle>
          <CardDescription>
            Select the local projects you want to migrate. This will also
            migrate associated tasks and PR merges.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No local projects found.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectedProjectIds.size === projects.length}
                  onCheckedChange={handleSelectAll}
                />
                <label
                  htmlFor="select-all"
                  className="text-sm font-medium cursor-pointer"
                >
                  Select all ({projects.length} projects)
                </label>
              </div>
              <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50"
                  >
                    <Checkbox
                      id={`project-${project.id}`}
                      checked={selectedProjectIds.has(project.id)}
                      onCheckedChange={() => handleToggleProject(project.id)}
                    />
                    <label
                      htmlFor={`project-${project.id}`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {project.id}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleStartMigration}
          disabled={
            migrating || !selectedOrgId || selectedProjectIds.size === 0
          }
        >
          {migrating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {migrating ? 'Migrating...' : 'Start Migration'}
        </Button>
      </div>
    </div>
  );
}
