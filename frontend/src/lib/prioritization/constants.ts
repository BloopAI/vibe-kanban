import type { PriorityFactor } from './types';

/**
 * Weights for each priority factor (should sum to ~1.0)
 */
export const PRIORITY_WEIGHTS: Record<PriorityFactor, number> = {
  dueDate: 0.3, // Due dates strongly influence priority
  keywords: 0.25, // Keywords like "urgent", "critical", "ASAP"
  age: 0.15, // Older tasks get slight boost
  labels: 0.15, // Labels like "bug", "security"
  stale: 0.1, // Tasks stuck in a status too long
  blocked: 0.05, // Tasks marked as blockers
};

/**
 * Keywords that indicate urgency (case-insensitive matching)
 */
export const URGENT_KEYWORDS = [
  'urgent',
  'critical',
  'asap',
  'emergency',
  'blocker',
  'hotfix',
  'p0',
  'p1',
  'security',
  'crash',
  'outage',
  'broken',
  'down',
  'incident',
];

/**
 * Keywords that indicate medium/normal priority
 */
export const MEDIUM_KEYWORDS = [
  'important',
  'p2',
  'soon',
  'needed',
  'required',
];

/**
 * Keywords that indicate lower priority
 */
export const LOW_KEYWORDS = [
  'nice-to-have',
  'someday',
  'maybe',
  'p3',
  'p4',
  'backlog',
  'later',
  'eventually',
];

/**
 * Labels that suggest higher priority
 */
export const HIGH_PRIORITY_LABELS = [
  'bug',
  'security',
  'critical',
  'hotfix',
  'urgent',
  'blocker',
  'regression',
];

/**
 * Labels that suggest lower priority
 */
export const LOW_PRIORITY_LABELS = [
  'nice-to-have',
  'enhancement',
  'tech-debt',
  'refactor',
  'documentation',
  'chore',
  'cleanup',
];

/**
 * Number of days after which a task is considered "stale"
 */
export const STALE_THRESHOLD_DAYS = 7;

/**
 * Number of days for "old" task age scoring
 */
export const OLD_TASK_THRESHOLD_DAYS = 14;

/**
 * Keywords that indicate a task is a blocker for others
 */
export const BLOCKER_KEYWORDS = [
  'blocker',
  'blocking',
  'blocks',
  'blocked by',
  'dependency',
  'prerequisite',
];
