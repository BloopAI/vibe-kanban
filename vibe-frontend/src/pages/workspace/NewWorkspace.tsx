import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Building2, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useTenantWorkspaces } from '@/hooks/useTenantWorkspaces';
import { teamsApi, projectsApi } from '@/lib/api';
import type {
  WorkspaceSetupState,
  TeamSetupData,
  ProjectSetupData,
  InviteSetupData,
  CreateTenantWorkspace,
} from '@/types/workspace';
import { WIZARD_STEPS } from '@/types/workspace';

import { SetupDetails } from './SetupDetails';
import { SetupTeams } from './SetupTeams';
import { SetupProjects } from './SetupProjects';
import { SetupInvite } from './SetupInvite';
import { SetupComplete } from './SetupComplete';

const initialState: WorkspaceSetupState = {
  step: 0,
  workspace: {},
  teams: [],
  projects: [],
  invites: [],
  createdWorkspaceId: null,
};

export function NewWorkspace() {
  const navigate = useNavigate();
  useUser(); // Ensure user is loaded
  const { createWorkspace, isCreating } = useTenantWorkspaces();
  const [state, setState] = useState<WorkspaceSetupState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = WIZARD_STEPS[state.step];
  const progress = ((state.step + 1) / WIZARD_STEPS.length) * 100;
  const isFirstStep = state.step === 0;
  const isLastStep = state.step === WIZARD_STEPS.length - 1;

  // Update workspace details
  const updateWorkspaceDetails = useCallback((data: Partial<CreateTenantWorkspace>) => {
    setState((prev) => ({
      ...prev,
      workspace: { ...prev.workspace, ...data },
    }));
  }, []);

  // Update teams
  const updateTeams = useCallback((teams: TeamSetupData[]) => {
    setState((prev) => ({ ...prev, teams }));
  }, []);

  // Update projects
  const updateProjects = useCallback((projects: ProjectSetupData[]) => {
    setState((prev) => ({ ...prev, projects }));
  }, []);

  // Update invites
  const updateInvites = useCallback((invites: InviteSetupData[]) => {
    setState((prev) => ({ ...prev, invites }));
  }, []);

  // Navigate steps
  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < WIZARD_STEPS.length) {
      setState((prev) => ({ ...prev, step }));
    }
  }, []);

  const goBack = useCallback(() => {
    if (state.step > 0) {
      goToStep(state.step - 1);
    } else {
      navigate(-1);
    }
  }, [state.step, goToStep, navigate]);

  const goNext = useCallback(async () => {
    // On the last content step (Invite), we need to create everything
    if (state.step === WIZARD_STEPS.length - 2) {
      setIsSubmitting(true);
      setError(null);

      try {
        // 1. Create the workspace
        const { name, slug, icon, color } = state.workspace;
        if (!name || !slug) {
          throw new Error('Workspace name and URL are required');
        }

        const workspace = await createWorkspace({
          name,
          slug,
          icon: icon || null,
          color: color || null,
        });

        // 2. Create teams (if any)
        // Note: Teams will be scoped to workspace in Phase 3
        const teamIdMap = new Map<string, string>(); // temp ID -> real ID
        for (const teamData of state.teams) {
          const team = await teamsApi.create({
            name: teamData.name,
            slug: teamData.name.toLowerCase().replace(/\s+/g, '-'),
            identifier: teamData.identifier,
            icon: teamData.icon,
            color: null,
          });
          teamIdMap.set(teamData.id, team.id);
        }

        // 3. Create projects (if any)
        // Note: Projects will be scoped to workspace in Phase 3
        for (const projectData of state.projects) {
          const teamId = projectData.teamId ? teamIdMap.get(projectData.teamId) : null;
          await projectsApi.create({
            name: projectData.name,
            repositories: [],
            priority: null,
            lead_id: null,
            start_date: null,
            target_date: null,
            status: null,
            description: projectData.description || null,
            summary: null,
            icon: null,
          });
          // Assign project to team if specified
          if (teamId) {
            // Note: Team-project assignment would go here
          }
        }

        // 4. Send invites (if any) - would need invite API
        // For now, we'll skip invites since the API may need to be implemented

        setState((prev) => ({
          ...prev,
          step: prev.step + 1,
          createdWorkspaceId: workspace.id,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create workspace');
      } finally {
        setIsSubmitting(false);
      }
    } else if (state.step < WIZARD_STEPS.length - 1) {
      goToStep(state.step + 1);
    }
  }, [state.step, state.workspace, state.teams, state.projects, createWorkspace, goToStep]);

  // Validate current step
  const isCurrentStepValid = useCallback(() => {
    switch (currentStep.id) {
      case 'details':
        return !!(state.workspace.name && state.workspace.slug);
      case 'teams':
      case 'projects':
      case 'invite':
        return true; // Optional steps
      case 'complete':
        return true;
      default:
        return false;
    }
  }, [currentStep.id, state.workspace]);

  // Handle finish - navigate to new workspace
  const handleFinish = useCallback(() => {
    if (state.createdWorkspaceId) {
      navigate('/inbox');
    } else {
      navigate('/');
    }
  }, [state.createdWorkspaceId, navigate]);

  // Render current step
  const renderStep = () => {
    switch (currentStep.id) {
      case 'details':
        return (
          <SetupDetails
            data={state.workspace}
            onChange={updateWorkspaceDetails}
          />
        );
      case 'teams':
        return (
          <SetupTeams
            teams={state.teams}
            onChange={updateTeams}
          />
        );
      case 'projects':
        return (
          <SetupProjects
            projects={state.projects}
            teams={state.teams}
            onChange={updateProjects}
          />
        );
      case 'invite':
        return (
          <SetupInvite
            invites={state.invites}
            onChange={updateInvites}
          />
        );
      case 'complete':
        return (
          <SetupComplete
            workspaceName={state.workspace.name || 'Your Workspace'}
            onFinish={handleFinish}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container max-w-3xl mx-auto py-4 px-4 flex items-center gap-4">
          <button
            onClick={goBack}
            className="p-2 hover:bg-accent rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Create Workspace</h1>
              <p className="text-sm text-muted-foreground">{currentStep.description}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Progress */}
      <div className="border-b bg-card">
        <div className="container max-w-3xl mx-auto py-3 px-4">
          <div className="flex items-center justify-between mb-2">
            {WIZARD_STEPS.map((step, index) => (
              <button
                key={step.id}
                onClick={() => index < state.step && goToStep(index)}
                disabled={index > state.step || isLastStep}
                className={cn(
                  'flex items-center gap-2 text-sm transition-colors',
                  index < state.step && 'text-primary cursor-pointer hover:underline',
                  index === state.step && 'text-foreground font-medium',
                  index > state.step && 'text-muted-foreground cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full text-xs',
                    index < state.step && 'bg-primary text-primary-foreground',
                    index === state.step && 'bg-primary text-primary-foreground',
                    index > state.step && 'bg-muted text-muted-foreground'
                  )}
                >
                  {index < state.step ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="hidden sm:inline">{step.title}</span>
              </button>
            ))}
          </div>
          <Progress value={progress} className="h-1" />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 container max-w-3xl mx-auto py-8 px-4">
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}
        {renderStep()}
      </main>

      {/* Footer - Navigation buttons */}
      {!isLastStep && (
        <footer className="border-t bg-card">
          <div className="container max-w-3xl mx-auto py-4 px-4 flex justify-between">
            <Button
              variant="ghost"
              onClick={goBack}
              disabled={isSubmitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {isFirstStep ? 'Cancel' : 'Back'}
            </Button>
            <Button
              onClick={goNext}
              disabled={!isCurrentStepValid() || isSubmitting || isCreating}
            >
              {isSubmitting || isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : state.step === WIZARD_STEPS.length - 2 ? (
                <>
                  Create Workspace
                  <Check className="h-4 w-4 ml-2" />
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
