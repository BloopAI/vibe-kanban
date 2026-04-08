import { useState } from 'react';
import {
  ExportSidebar,
  type ExportStep,
} from '@vibe/ui/components/ExportSidebar';
import { ExportIntroduction } from './ExportIntroduction';
import {
  ExportChooseProjects,
  type ExportOrganization,
  type ExportProject,
} from './ExportChooseProjects';
import { ExportDownload, type ExportRequest } from './ExportDownload';

interface ExportLayoutProps {
  exportFn: (request: ExportRequest) => Promise<Response>;
  organizations: ExportOrganization[];
  orgsLoading: boolean;
  projects: ExportProject[];
  projectsLoading: boolean;
  selectedOrgId: string | null;
  onOrgChange: (orgId: string) => void;
}

interface ExportData {
  orgId: string;
  projectIds: string[];
  includeAttachments: boolean;
}

export function ExportLayout({
  exportFn,
  organizations,
  orgsLoading,
  projects,
  projectsLoading,
  selectedOrgId,
  onOrgChange,
}: ExportLayoutProps) {
  const [currentStep, setCurrentStep] = useState<ExportStep>('introduction');
  const [exportData, setExportData] = useState<ExportData | null>(null);

  const handleChooseProjectsContinue = (
    orgId: string,
    projectIds: string[],
    includeAttachments: boolean
  ) => {
    setExportData({
      orgId,
      projectIds,
      includeAttachments,
    });
    setCurrentStep('download');
  };

  const renderContent = () => {
    switch (currentStep) {
      case 'introduction':
        return (
          <ExportIntroduction
            onContinue={() => setCurrentStep('choose-projects')}
          />
        );
      case 'choose-projects':
        return (
          <ExportChooseProjects
            organizations={organizations}
            orgsLoading={orgsLoading}
            projects={projects}
            projectsLoading={projectsLoading}
            selectedOrgId={selectedOrgId}
            onOrgChange={onOrgChange}
            onContinue={handleChooseProjectsContinue}
          />
        );
      case 'download':
        if (!exportData) {
          return null;
        }
        return (
          <ExportDownload
            orgId={exportData.orgId}
            projectIds={exportData.projectIds}
            includeAttachments={exportData.includeAttachments}
            onExportMore={() => setCurrentStep('choose-projects')}
            exportFn={exportFn}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-double">
      <ExportSidebar currentStep={currentStep} onStepChange={setCurrentStep} />
      <div className="rounded-sm border border-border bg-panel">
        {renderContent()}
      </div>
    </div>
  );
}
