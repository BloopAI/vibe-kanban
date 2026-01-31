import { describe, it, expect } from 'vitest';
import type { Project } from 'shared/types';
import {
  isDirectoryOnly,
  canCreateAttempt,
  shouldShowGitOperations,
  shouldShowDiff,
} from './directoryProject';

const makeProject = (
  overrides: Partial<Project> = {}
): Project => ({
  id: 'proj-1',
  name: 'Test Project',
  default_agent_working_dir: null,
  remote_project_id: null,
  working_directory: null,
  auto_run_enabled: false,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe('isDirectoryOnly', () => {
  it('returns true when working_directory is set and repos is 0', () => {
    const project = makeProject({ working_directory: '/home/user/code' });
    expect(isDirectoryOnly(project, 0)).toBe(true);
  });

  it('returns false when working_directory is set but repos > 0', () => {
    const project = makeProject({ working_directory: '/home/user/code' });
    expect(isDirectoryOnly(project, 2)).toBe(false);
  });

  it('returns false when working_directory is null', () => {
    const project = makeProject({ working_directory: null });
    expect(isDirectoryOnly(project, 0)).toBe(false);
  });

  it('returns false when project is null', () => {
    expect(isDirectoryOnly(null, 0)).toBe(false);
  });
});

describe('canCreateAttempt', () => {
  it('returns true for directory-only project with a profile', () => {
    expect(
      canCreateAttempt({
        isDirectoryOnly: true,
        hasProfile: true,
        allBranchesSelected: false,
        reposCount: 0,
        isCreating: false,
        isLoading: false,
      })
    ).toBe(true);
  });

  it('returns false when profile is missing', () => {
    expect(
      canCreateAttempt({
        isDirectoryOnly: true,
        hasProfile: false,
        allBranchesSelected: false,
        reposCount: 0,
        isCreating: false,
        isLoading: false,
      })
    ).toBe(false);
  });

  it('returns false when loading', () => {
    expect(
      canCreateAttempt({
        isDirectoryOnly: true,
        hasProfile: true,
        allBranchesSelected: false,
        reposCount: 0,
        isCreating: false,
        isLoading: true,
      })
    ).toBe(false);
  });

  it('returns true for git project with all branches selected', () => {
    expect(
      canCreateAttempt({
        isDirectoryOnly: false,
        hasProfile: true,
        allBranchesSelected: true,
        reposCount: 2,
        isCreating: false,
        isLoading: false,
      })
    ).toBe(true);
  });
});

describe('shouldShowGitOperations', () => {
  it('returns false when there are 0 repos', () => {
    expect(shouldShowGitOperations(0)).toBe(false);
  });

  it('returns true when repos > 0', () => {
    expect(shouldShowGitOperations(3)).toBe(true);
  });
});

describe('shouldShowDiff', () => {
  it('returns false when branch is empty string', () => {
    expect(shouldShowDiff('')).toBe(false);
  });

  it('returns true when branch is non-empty', () => {
    expect(shouldShowDiff('feature/my-branch')).toBe(true);
  });
});
