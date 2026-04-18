import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DisplayConversationEntry from '../DisplayConversationEntry';
import {
  ExecutionProcess,
  ExecutionProcessStatus,
  TaskAttempt,
  NormalizedEntry,
  BaseCodingAgent,
} from 'shared/types';

// Factory: Create minimal valid NormalizedEntry for user_message type
function createUserMessageEntry(
  overrides?: Partial<NormalizedEntry>
): NormalizedEntry {
  return {
    timestamp: new Date().toISOString(),
    entry_type: { type: 'user_message' },
    content: 'Test message',
    metadata: null,
    ...overrides,
  };
}

// Factory: Create minimal valid TaskAttempt
function createMockTaskAttempt(overrides?: Partial<TaskAttempt>): TaskAttempt {
  return {
    id: 'attempt-123',
    task_id: 'task-123',
    container_ref: null,
    branch: 'feature-branch',
    target_branch: 'main',
    executor: BaseCodingAgent.CLAUDE_CODE,
    worktree_deleted: false,
    setup_completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Factory: Create complete ExecutionProcess with variant
function createMockExecutionProcess(
  id: string,
  variant: string | null,
  executor: BaseCodingAgent = BaseCodingAgent.CLAUDE_CODE
): ExecutionProcess {
  return {
    id,
    task_attempt_id: 'attempt-123',
    run_reason: 'codingagent',
    executor_action: {
      typ: {
        type: 'CodingAgentInitialRequest',
        prompt: 'test prompt',
        executor_profile_id: {
          executor,
          variant,
        },
      },
      next_action: null,
    },
    before_head_commit: null,
    after_head_commit: null,
    status: ExecutionProcessStatus.running,
    exit_code: null,
    dropped: false,
    pid: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Create mutable mock data
let mockExecutionProcessesById: Record<string, ExecutionProcess> = {
  'test-process-id': createMockExecutionProcess('test-process-id', 'PLAN'),
};

vi.mock('@/contexts/ExecutionProcessesContext', () => ({
  useExecutionProcessesContext: () => ({
    get executionProcessesByIdAll() {
      return mockExecutionProcessesById;
    },
    get executionProcessesAll() {
      return Object.values(mockExecutionProcessesById);
    },
    get executionProcessesByIdVisible() {
      return mockExecutionProcessesById;
    },
    get executionProcessesVisible() {
      return Object.values(mockExecutionProcessesById);
    },
    isAttemptRunningAll: false,
    isAttemptRunningVisible: false,
    isLoading: false,
    isConnected: true,
    error: null,
  }),
}));

// Mock other required dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/ConfigProvider', () => ({
  useUserSystem: () => ({
    capabilities: {
      CLAUDE_CODE: ['session.fork'],
    },
  }),
}));

vi.mock('@/hooks/useProcessRetry', () => ({
  useProcessRetry: () => null,
}));

vi.mock('@/hooks/follow-up/useDraftStream', () => ({
  useDraftStream: () => ({ retryDraft: null }),
}));

vi.mock('@/contexts/RetryUiContext', () => ({
  useRetryUi: () => ({
    activeRetryProcessId: null,
    isProcessGreyed: () => false,
  }),
}));

vi.mock('@/contexts/FileViewerContext', () => ({
  useFileViewer: () => ({
    openFile: vi.fn(),
  }),
}));

describe('DisplayConversationEntry - Executor Variant Integration', () => {
  it('displays executor variant from ExecutionProcess data', () => {
    const entry = createUserMessageEntry({ content: 'Test message' });
    const mockTaskAttempt = createMockTaskAttempt();

    render(
      <DisplayConversationEntry
        entry={entry}
        expansionKey="test-key"
        executionProcessId="test-process-id"
        taskAttempt={mockTaskAttempt}
      />
    );

    // Verify that the variant "PLAN" is displayed alongside the executor
    expect(screen.getByText('CLAUDE_CODE / PLAN')).toBeInTheDocument();
  });

  it('displays only executor when ExecutionProcess has no variant', () => {
    // Update the mock data to have no variant
    mockExecutionProcessesById = {
      'no-variant-id': createMockExecutionProcess('no-variant-id', null),
    };

    const entry = createUserMessageEntry({ content: 'Test message' });
    const mockTaskAttempt = createMockTaskAttempt();

    render(
      <DisplayConversationEntry
        entry={entry}
        expansionKey="test-key-2"
        executionProcessId="no-variant-id"
        taskAttempt={mockTaskAttempt}
      />
    );

    // Should show executor only, without variant
    expect(screen.getByText('CLAUDE_CODE')).toBeInTheDocument();
    // Verify there's no slash (which would indicate "EXECUTOR / VARIANT")
    const text = screen.getByText('CLAUDE_CODE').textContent || '';
    expect(text).not.toContain('/');
  });
});

describe('edge cases', () => {
  it('handles missing executionProcessId gracefully', () => {
    const entry = createUserMessageEntry();
    const mockTaskAttempt = createMockTaskAttempt();

    render(
      <DisplayConversationEntry
        entry={entry}
        expansionKey="test-key"
        // No executionProcessId provided
        taskAttempt={mockTaskAttempt}
      />
    );

    // Should render without crashing, show executor without variant
    expect(screen.getByText('CLAUDE_CODE')).toBeInTheDocument();
  });

  it('handles ScriptRequest executor action type (no variant)', () => {
    mockExecutionProcessesById = {
      'script-process': {
        ...createMockExecutionProcess('script-process', null),
        executor_action: {
          typ: {
            type: 'ScriptRequest',
            script: 'echo "test"',
            language: 'Bash' as const,
            context: 'DevServer' as const,
          },
          next_action: null,
        },
      },
    };

    const entry = createUserMessageEntry();
    const mockTaskAttempt = createMockTaskAttempt();

    render(
      <DisplayConversationEntry
        entry={entry}
        expansionKey="test-key"
        executionProcessId="script-process"
        taskAttempt={mockTaskAttempt}
      />
    );

    // ScriptRequest type should not show variant
    expect(screen.getByText('CLAUDE_CODE')).toBeInTheDocument();
  });

  it('handles CodingAgentFollowUpRequest with variant', () => {
    mockExecutionProcessesById = {
      'followup-process': {
        ...createMockExecutionProcess('followup-process', 'ROUTER'),
        executor_action: {
          typ: {
            type: 'CodingAgentFollowUpRequest',
            prompt: 'follow up',
            session_id: 'session-123',
            executor_profile_id: {
              executor: BaseCodingAgent.CLAUDE_CODE,
              variant: 'ROUTER',
            },
          },
          next_action: null,
        },
      },
    };

    const entry = createUserMessageEntry();
    const mockTaskAttempt = createMockTaskAttempt();

    render(
      <DisplayConversationEntry
        entry={entry}
        expansionKey="test-key"
        executionProcessId="followup-process"
        taskAttempt={mockTaskAttempt}
      />
    );

    expect(screen.getByText('CLAUDE_CODE / ROUTER')).toBeInTheDocument();
  });

  it('renders stopped execution markers with user-facing status text', () => {
    const entry: NormalizedEntry = {
      timestamp: new Date().toISOString(),
      entry_type: {
        type: 'execution_end',
        process_id: 'proc-1',
        process_name: 'Codex Review',
        started_at: '2026-04-18T10:00:00.000Z',
        ended_at: '2026-04-18T10:00:05.000Z',
        duration_seconds: BigInt(5),
        status: 'killed',
      },
      content: '',
      metadata: null,
    };

    render(
      <DisplayConversationEntry entry={entry} expansionKey="execution-end" />
    );

    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText(/Codex Review finished at/i)).toBeInTheDocument();
  });
});
