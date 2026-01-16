import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { TaskProperty } from 'shared/types';

export interface TaskPropertiesMap {
  [taskId: string]: TaskProperty[];
}

export interface ParsedTaskProperties {
  [taskId: string]: {
    // GitHub Project fields (prefixed with github_)
    githubStatus?: string;
    githubPriority?: string;
    githubAssignees?: string[];
    githubLabels?: Array<{ name: string; color: string }>;
    // Add more fields as needed
    [key: string]: unknown;
  };
}

/**
 * Parse task properties into a more usable format
 */
function parseTaskProperties(
  properties: TaskProperty[]
): ParsedTaskProperties[string] {
  const parsed: ParsedTaskProperties[string] = {};

  for (const prop of properties) {
    const name = prop.property_name;

    // Handle known property types
    if (name === 'github_assignees') {
      try {
        parsed.githubAssignees = JSON.parse(prop.property_value);
      } catch {
        parsed.githubAssignees = [];
      }
    } else if (name === 'labels') {
      try {
        parsed.githubLabels = JSON.parse(prop.property_value);
      } catch {
        parsed.githubLabels = [];
      }
    } else if (name === 'github_status') {
      parsed.githubStatus = prop.property_value;
    } else if (name === 'github_priority') {
      parsed.githubPriority = prop.property_value;
    } else if (name.startsWith('github_')) {
      // Store other github_ prefixed properties using the original name without prefix
      // This handles Japanese field names like github_ジャンル -> ジャンル
      const key = name.replace('github_', '');
      parsed[key] = prop.property_value;
    } else {
      // Store other properties as-is
      parsed[name] = prop.property_value;
    }
  }

  return parsed;
}

/**
 * Fetch properties for multiple tasks
 */
export function useTaskProperties(taskIds: string[]) {
  return useQuery({
    queryKey: ['taskProperties', taskIds.sort().join(',')],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const raw = await tasksApi.getBulkProperties(taskIds);
      const parsed: ParsedTaskProperties = {};
      for (const [taskId, props] of Object.entries(raw)) {
        parsed[taskId] = parseTaskProperties(props);
      }
      return parsed;
    },
    enabled: taskIds.length > 0,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch properties for a single task
 */
export function useSingleTaskProperties(taskId: string | undefined) {
  return useQuery({
    queryKey: ['taskProperties', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const props = await tasksApi.getProperties(taskId);
      return parseTaskProperties(props);
    },
    enabled: !!taskId,
    staleTime: 30000,
  });
}
