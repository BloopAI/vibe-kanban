/**
 * Types for Tenant Workspaces
 * Matches the backend models in tenant_workspace.rs
 */

// Workspace member role enum
export type WorkspaceMemberRole = 'owner' | 'admin' | 'member';

// Tenant Workspace - organizational container
export interface TenantWorkspace {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Tenant Workspace Member
export interface TenantWorkspaceMember {
  id: string;
  tenant_workspace_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: WorkspaceMemberRole;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

// Create workspace payload
export interface CreateTenantWorkspace {
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
}

// Update workspace payload
export interface UpdateTenantWorkspace {
  name?: string;
  icon?: string | null;
  color?: string | null;
  settings?: Record<string, unknown>;
}

// Add member payload
export interface AddWorkspaceMember {
  user_id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: WorkspaceMemberRole;
}

// Update member role payload
export interface UpdateWorkspaceMemberRole {
  role: WorkspaceMemberRole;
}

// Workspace setup wizard state
export interface WorkspaceSetupState {
  step: number;
  workspace: Partial<CreateTenantWorkspace>;
  teams: TeamSetupData[];
  projects: ProjectSetupData[];
  invites: InviteSetupData[];
  createdWorkspaceId: string | null;
}

// Team data for wizard
export interface TeamSetupData {
  id: string; // temp id for UI
  name: string;
  identifier: string;
  icon: string | null;
}

// Project data for wizard
export interface ProjectSetupData {
  id: string; // temp id for UI
  name: string;
  teamId: string | null;
  description: string;
}

// Invite data for wizard
export interface InviteSetupData {
  id: string; // temp id for UI
  email: string;
  role: WorkspaceMemberRole;
}

// Wizard step definitions
export const WIZARD_STEPS = [
  { id: 'details', title: 'Workspace Details', description: 'Name and customize your workspace' },
  { id: 'teams', title: 'Teams', description: 'Create teams to organize your work' },
  { id: 'projects', title: 'Projects', description: 'Set up initial projects' },
  { id: 'invite', title: 'Invite Members', description: 'Invite your team members' },
  { id: 'complete', title: 'Complete', description: 'All set!' },
] as const;

export type WizardStepId = typeof WIZARD_STEPS[number]['id'];
