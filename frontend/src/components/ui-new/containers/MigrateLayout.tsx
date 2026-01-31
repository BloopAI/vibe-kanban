import { useState } from 'react';
import {
  MigrateSidebar,
  type MigrationStep,
} from '@/components/ui-new/views/MigrateSidebar';
import { MigrateIntroduction } from '@/components/ui-new/views/MigrateIntroduction';

export function MigrateLayout() {
  const [currentStep, setCurrentStep] = useState<MigrationStep>('introduction');

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
          <div className="p-base text-normal">
            Choose projects step - Coming soon
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
