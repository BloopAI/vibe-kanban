import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MigrateSidebar,
  type MigrationStep,
} from '@/components/ui-new/views/MigrateSidebar';
import { MigrateIntroductionContainer } from '@/components/ui-new/containers/MigrateIntroductionContainer';
import { MigrateChooseProjectsContainer } from '@/components/ui-new/containers/MigrateChooseProjectsContainer';
import { MigrateMigrateContainer } from '@/components/ui-new/containers/MigrateMigrateContainer';
import { MigrateFinishContainer } from '@/components/ui-new/containers/MigrateFinishContainer';

interface MigrationData {
  orgId: string;
  projectIds: string[];
}

export function MigrateLayout() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<MigrationStep>('introduction');
  const [migrationData, setMigrationData] = useState<MigrationData | null>(
    null
  );

  const handleSkip = () => {
    navigate('/workspaces/create', { replace: true });
  };

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
          <MigrateIntroductionContainer
            onContinue={() => setCurrentStep('choose-projects')}
          />
        );
      case 'choose-projects':
        return (
          <MigrateChooseProjectsContainer
            onContinue={handleChooseProjectsContinue}
            onSkip={handleSkip}
          />
        );
      case 'migrate':
        if (!migrationData) {
          return null;
        }
        return (
          <MigrateMigrateContainer
            orgId={migrationData.orgId}
            projectIds={migrationData.projectIds}
            onContinue={() => setCurrentStep('finish')}
          />
        );
      case 'finish':
        if (!migrationData) {
          return null;
        }
        return (
          <MigrateFinishContainer
            orgId={migrationData.orgId}
            projectIds={migrationData.projectIds}
            onMigrateMore={() => setCurrentStep('choose-projects')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-double">
      <MigrateSidebar currentStep={currentStep} onStepChange={setCurrentStep} />
      <div className="rounded-sm border border-border bg-panel">
        {renderContent()}
      </div>
    </div>
  );
}
