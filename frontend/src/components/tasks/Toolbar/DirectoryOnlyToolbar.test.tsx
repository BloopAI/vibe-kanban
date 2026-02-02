import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Workspace } from 'shared/types';

const mockMutateAsync = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'git.states.markDone': 'Mark as Done',
        'git.states.completing': 'Completing...',
        'git.states.completed': 'Done!',
      };
      return translations[key] ?? key;
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/hooks/useCompleteTask', () => ({
  useCompleteTask: () => ({ mutateAsync: mockMutateAsync }),
}));

import { DirectoryOnlyToolbar } from './GitOperations';

const makeWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: 'ws-1',
  task_id: 'task-1',
  branch: '',
  container_ref: null,
  agent_working_dir: null,
  setup_completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  archived: false,
  pinned: false,
  name: null,
  ...overrides,
});

describe('DirectoryOnlyToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it('renders the Mark as Done button', () => {
    render(
      <DirectoryOnlyToolbar
        selectedAttempt={makeWorkspace()}
        isAttemptRunning={false}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Mark as Done' })
    ).toBeInTheDocument();
  });

  it('button is disabled when isAttemptRunning is true', () => {
    render(
      <DirectoryOnlyToolbar
        selectedAttempt={makeWorkspace()}
        isAttemptRunning={true}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Mark as Done' })
    ).toBeDisabled();
  });

  it('calls mutateAsync when button is clicked', async () => {
    render(
      <DirectoryOnlyToolbar
        selectedAttempt={makeWorkspace()}
        isAttemptRunning={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark as Done' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
  });
});
