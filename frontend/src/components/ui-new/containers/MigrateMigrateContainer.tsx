import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { migrationApi } from '@/lib/api';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { MigrateMigrate } from '@/components/ui-new/views/MigrateMigrate';
import type { MigrationReport } from 'shared/types';

interface MigrateMigrateContainerProps {
  orgId: string;
  projectIds: string[];
  onContinue: () => void;
}

export function MigrateMigrateContainer({
  orgId,
  projectIds,
  onContinue,
}: MigrateMigrateContainerProps) {
  const { data: orgsData } = useUserOrganizations();
  const organizations = useMemo(
    () => orgsData?.organizations ?? [],
    [orgsData?.organizations]
  );

  const [isMigrating, setIsMigrating] = useState(true);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasStartedRef = useRef(false);

  const orgName =
    organizations.find((org) => org.id === orgId)?.name ?? 'Unknown';

  const startMigration = useCallback(async () => {
    setIsMigrating(true);
    setError(null);
    setReport(null);

    try {
      const response = await migrationApi.start({
        organization_id: orgId,
        project_ids: projectIds,
      });
      setReport(response.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  }, [orgId, projectIds]);

  // Start migration on mount (only once)
  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;
    void startMigration();
  }, [startMigration]);

  const handleRetry = () => {
    void startMigration();
  };

  return (
    <MigrateMigrate
      orgName={orgName}
      projectCount={projectIds.length}
      isMigrating={isMigrating}
      report={report}
      error={error}
      onRetry={handleRetry}
      onContinue={onContinue}
    />
  );
}
