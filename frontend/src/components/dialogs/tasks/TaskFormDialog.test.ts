import { describe, it, expect } from 'vitest';
import { validateTaskForm } from './TaskFormDialog';
import { type TaskStatus, type ExecutorProfileId, BaseCodingAgent } from 'shared/types';

const defaultProfile: ExecutorProfileId = {
  executor: BaseCodingAgent.CLAUDE_CODE,
  variant: null,
};

const makeFormValues = (
  overrides: Partial<{
    title: string;
    description: string;
    status: TaskStatus;
    executorProfileId: ExecutorProfileId | null;
    repoBranches: { repoId: string; branch: string }[];
    autoStart: boolean;
  }> = {}
) => ({
  title: 'My Task',
  description: '',
  status: 'todo' as TaskStatus,
  executorProfileId: defaultProfile,
  repoBranches: [],
  autoStart: false,
  ...overrides,
});

describe('validateTaskForm', () => {
  it('rejects empty title', () => {
    expect(
      validateTaskForm(makeFormValues({ title: '  ' }), {
        forceCreateOnly: false,
        projectReposCount: 0,
      })
    ).toBe('need title');
  });

  it('passes with just a title when autoStart is off', () => {
    expect(
      validateTaskForm(
        makeFormValues({ autoStart: false, executorProfileId: null }),
        { forceCreateOnly: false, projectReposCount: 2 }
      )
    ).toBeUndefined();
  });

  describe('autoStart on', () => {
    it('rejects missing executor profile', () => {
      expect(
        validateTaskForm(
          makeFormValues({ autoStart: true, executorProfileId: null }),
          { forceCreateOnly: false, projectReposCount: 0 }
        )
      ).toBe('need executor profile');
    });

    it('rejects empty repoBranches when project has repos', () => {
      expect(
        validateTaskForm(
          makeFormValues({ autoStart: true, repoBranches: [] }),
          { forceCreateOnly: false, projectReposCount: 2 }
        )
      ).toBe('need branch for all repos');
    });

    it('rejects when a repo is missing a branch', () => {
      expect(
        validateTaskForm(
          makeFormValues({
            autoStart: true,
            repoBranches: [
              { repoId: 'r1', branch: 'main' },
              { repoId: 'r2', branch: '' },
            ],
          }),
          { forceCreateOnly: false, projectReposCount: 2 }
        )
      ).toBe('need branch for all repos');
    });

    it('passes when all repos have branches', () => {
      expect(
        validateTaskForm(
          makeFormValues({
            autoStart: true,
            repoBranches: [
              { repoId: 'r1', branch: 'main' },
              { repoId: 'r2', branch: 'develop' },
            ],
          }),
          { forceCreateOnly: false, projectReposCount: 2 }
        )
      ).toBeUndefined();
    });

    it('passes for directory-only project with no repos', () => {
      expect(
        validateTaskForm(
          makeFormValues({ autoStart: true, repoBranches: [] }),
          { forceCreateOnly: false, projectReposCount: 0 }
        )
      ).toBeUndefined();
    });
  });

  describe('forceCreateOnly', () => {
    it('skips autoStart validation when forceCreateOnly is true', () => {
      expect(
        validateTaskForm(
          makeFormValues({
            autoStart: true,
            executorProfileId: null,
            repoBranches: [],
          }),
          { forceCreateOnly: true, projectReposCount: 2 }
        )
      ).toBeUndefined();
    });
  });
});
