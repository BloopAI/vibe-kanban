// Swarm types - Re-exporting from shared/types for convenience
// Local utility functions for swarm components

export {
  type Swarm,
  type SwarmStatus,
  type SwarmTask,
  type SwarmTaskStatus,
  type TaskPriority,
  type CreateSwarmTask,
  type UpdateSwarmTask,
  type TaskStatusCounts,
  type SwarmChat as SwarmChatType,
  type SenderType,
  type Sandbox,
  type SandboxStatus,
} from 'shared/types';

// Local interface for chat messages with parsed metadata
export interface SwarmChatMessage {
  id: string;
  swarm_id: string;
  sender_type: 'system' | 'user' | 'sandbox';
  sender_id: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface TaskMetadata {
  skill: string | null;
  cli: string | null;
  tags: string[];
}

export function extractTaskMetadata(description: string | null): TaskMetadata {
  if (!description) {
    return { skill: null, cli: null, tags: [] };
  }

  const skillMatch = description.match(/SKILL:\s*([^\n]+)/i);
  const cliMatch = description.match(/CLI:\s*([^\n]+)/i);

  return {
    skill: skillMatch ? skillMatch[1].trim() : null,
    cli: cliMatch ? cliMatch[1].trim() : null,
    tags: [],
  };
}

export function formatDuration(startedAt: Date | string | null, completedAt: Date | string | null): string {
  if (!startedAt) return '--';

  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  const end = completedAt
    ? (completedAt instanceof Date ? completedAt.getTime() : new Date(completedAt).getTime())
    : Date.now();
  const durationMs = end - start;

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
