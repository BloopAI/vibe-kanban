import { useState } from 'react';
import {
  MigrateSidebar,
  type MigrationStep,
} from '@/components/ui-new/views/MigrateSidebar';
import { MigrateIntroduction } from '@/components/ui-new/views/MigrateIntroduction';
import { MigrateChooseProjects } from '@/components/ui-new/views/MigrateChooseProjects';

interface MigrationData {
  orgId: string;
  projectIds: string[];
}

export function MigrateLayout() {
  const [currentStep, setCurrentStep] = useState<MigrationStep>('introduction');
  const [migrationData, setMigrationData] = useState<MigrationData | null>(
    null
  );

  const handleChooseProjectsContinue = (
    orgId: string,
    projectIds: string[]
  ) => {
    setMigrationData({ orgId, projectIds });
    setCurrentStep('migrate');
  };

  const renderContent = () => {
    switch (currentStep) {
      case 'introduction':
        return (
          <MigrateIntroduction
            onContinue={() => setCurrentStep('choose-projects')}
          />
        );
      case 'choose-projects':
        return (
          <MigrateChooseProjects onContinue={handleChooseProjectsContinue} />
        );
      case 'migrate':
        return (
          <div className="p-base text-normal">
            Migrate step - Coming soon
            {migrationData && (
              <div className="mt-base text-sm text-low">
                Migrating {migrationData.projectIds.length} project(s) to org{' '}
                {migrationData.orgId}
              </div>
            )}
          </div>
        );
      case 'finish':
        return (
          <div className="p-base text-normal">Finish step - Coming soon</div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Left sidebar navigation */}
      <MigrateSidebar currentStep={currentStep} onStepChange={setCurrentStep} />

      {/* Main content area */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-primary">
        {renderContent()}
      </div>
    </div>
  );
}
