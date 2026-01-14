import type { TaskPriority, TaskWithAttemptStatus } from 'shared/types';
import type { PriorityReason } from './types';
import {
  PRIORITY_WEIGHTS,
  URGENT_KEYWORDS,
  MEDIUM_KEYWORDS,
  LOW_KEYWORDS,
  HIGH_PRIORITY_LABELS,
  LOW_PRIORITY_LABELS,
  STALE_THRESHOLD_DAYS,
  OLD_TASK_THRESHOLD_DAYS,
  BLOCKER_KEYWORDS,
} from './constants';

/**
 * Convert a numeric score (0-1) to a TaskPriority
 */
export function scoreToPriority(score: number): TaskPriority {
  if (score >= 0.8) return 'urgent';
  if (score >= 0.6) return 'high';
  if (score >= 0.4) return 'medium';
  if (score >= 0.2) return 'low';
  return 'none';
}

/**
 * Get the number of days since a date
 */
function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get the number of days until a date (negative if past)
 */
function daysUntil(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if text contains any of the keywords (case-insensitive)
 */
function containsKeyword(text: string, keywords: string[]): string | null {
  const lowerText = text.toLowerCase();
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}

/**
 * Score based on task age (older tasks get higher priority)
 */
function scoreAge(task: TaskWithAttemptStatus): {
  score: number;
  reason: PriorityReason | null;
} {
  const age = daysSince(task.created_at);
  const weight = PRIORITY_WEIGHTS.age;

  if (age < 3) {
    return { score: 0, reason: null };
  }

  // Scale: 3 days = 0.2, 14+ days = 1.0
  const normalizedAge = Math.min(age / OLD_TASK_THRESHOLD_DAYS, 1);
  const contribution = normalizedAge * weight;

  if (contribution < 0.01) {
    return { score: 0, reason: null };
  }

  return {
    score: contribution,
    reason: {
      factor: 'age',
      contribution,
      explanation:
        age >= OLD_TASK_THRESHOLD_DAYS
          ? `Task is ${age} days old`
          : `Task has been open for ${age} days`,
    },
  };
}

/**
 * Score based on due date proximity
 */
function scoreDueDate(task: TaskWithAttemptStatus): {
  score: number;
  reason: PriorityReason | null;
} {
  if (!task.due_date) {
    return { score: 0, reason: null };
  }

  const days = daysUntil(task.due_date);
  const weight = PRIORITY_WEIGHTS.dueDate;
  let contribution: number;
  let explanation: string;

  if (days < 0) {
    // Overdue
    contribution = weight;
    explanation = `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  } else if (days === 0) {
    // Due today
    contribution = weight * 0.95;
    explanation = 'Due today';
  } else if (days === 1) {
    // Due tomorrow
    contribution = weight * 0.85;
    explanation = 'Due tomorrow';
  } else if (days <= 3) {
    // Due within 3 days
    contribution = weight * 0.7;
    explanation = `Due in ${days} days`;
  } else if (days <= 7) {
    // Due within a week
    contribution = weight * 0.5;
    explanation = `Due in ${days} days`;
  } else {
    // Due later
    contribution = weight * 0.2;
    explanation = `Due in ${days} days`;
  }

  return {
    score: contribution,
    reason: {
      factor: 'dueDate',
      contribution,
      explanation,
    },
  };
}

/**
 * Score based on urgent/priority keywords in title and description
 */
function scoreKeywords(task: TaskWithAttemptStatus): {
  score: number;
  reason: PriorityReason | null;
} {
  const text = `${task.title} ${task.description || ''}`;
  const weight = PRIORITY_WEIGHTS.keywords;

  // Check for urgent keywords first
  const urgentKeyword = containsKeyword(text, URGENT_KEYWORDS);
  if (urgentKeyword) {
    return {
      score: weight,
      reason: {
        factor: 'keywords',
        contribution: weight,
        explanation: `Contains urgent keyword: "${urgentKeyword}"`,
      },
    };
  }

  // Check for medium priority keywords
  const mediumKeyword = containsKeyword(text, MEDIUM_KEYWORDS);
  if (mediumKeyword) {
    return {
      score: weight * 0.5,
      reason: {
        factor: 'keywords',
        contribution: weight * 0.5,
        explanation: `Contains priority keyword: "${mediumKeyword}"`,
      },
    };
  }

  // Check for low priority keywords (negative signal)
  const lowKeyword = containsKeyword(text, LOW_KEYWORDS);
  if (lowKeyword) {
    return {
      score: 0,
      reason: {
        factor: 'keywords',
        contribution: 0,
        explanation: `Contains low-priority keyword: "${lowKeyword}"`,
      },
    };
  }

  return { score: 0, reason: null };
}

/**
 * Score based on task labels
 */
function scoreLabels(task: TaskWithAttemptStatus): {
  score: number;
  reason: PriorityReason | null;
} {
  if (!task.labels || task.labels.length === 0) {
    return { score: 0, reason: null };
  }

  const weight = PRIORITY_WEIGHTS.labels;
  const labelNames = task.labels.map((l) => l.name.toLowerCase());

  // Check for high priority labels
  for (const highLabel of HIGH_PRIORITY_LABELS) {
    if (labelNames.some((l) => l.includes(highLabel))) {
      return {
        score: weight,
        reason: {
          factor: 'labels',
          contribution: weight,
          explanation: `Has high-priority label: "${highLabel}"`,
        },
      };
    }
  }

  // Check for low priority labels
  for (const lowLabel of LOW_PRIORITY_LABELS) {
    if (labelNames.some((l) => l.includes(lowLabel))) {
      return {
        score: 0,
        reason: {
          factor: 'labels',
          contribution: 0,
          explanation: `Has low-priority label: "${lowLabel}"`,
        },
      };
    }
  }

  return { score: 0, reason: null };
}

/**
 * Score based on staleness (task hasn't been updated in a while)
 */
function scoreStale(task: TaskWithAttemptStatus): {
  score: number;
  reason: PriorityReason | null;
} {
  // Only consider tasks in actionable statuses
  if (task.status === 'done' || task.status === 'cancelled') {
    return { score: 0, reason: null };
  }

  const daysSinceUpdate = daysSince(task.updated_at);
  const weight = PRIORITY_WEIGHTS.stale;

  if (daysSinceUpdate < STALE_THRESHOLD_DAYS) {
    return { score: 0, reason: null };
  }

  // In-progress tasks that are stale need more attention
  const multiplier = task.status === 'inprogress' ? 1.5 : 1.0;
  const normalizedStale = Math.min(
    daysSinceUpdate / (STALE_THRESHOLD_DAYS * 2),
    1
  );
  const contribution = Math.min(normalizedStale * weight * multiplier, weight);

  return {
    score: contribution,
    reason: {
      factor: 'stale',
      contribution,
      explanation:
        task.status === 'inprogress'
          ? `In progress but stale for ${daysSinceUpdate} days`
          : `No updates for ${daysSinceUpdate} days`,
    },
  };
}

/**
 * Score based on blocker keywords
 */
function scoreBlocked(task: TaskWithAttemptStatus): {
  score: number;
  reason: PriorityReason | null;
} {
  const text = `${task.title} ${task.description || ''}`;
  const weight = PRIORITY_WEIGHTS.blocked;

  const blockerKeyword = containsKeyword(text, BLOCKER_KEYWORDS);
  if (blockerKeyword) {
    return {
      score: weight,
      reason: {
        factor: 'blocked',
        contribution: weight,
        explanation: `May be blocking other work: "${blockerKeyword}"`,
      },
    };
  }

  return { score: 0, reason: null };
}

/**
 * Compute the overall priority score for a task
 */
export function computeTaskScore(task: TaskWithAttemptStatus): {
  score: number;
  reasons: PriorityReason[];
} {
  const reasons: PriorityReason[] = [];
  let totalScore = 0;

  // Run all scoring functions
  const scorers = [
    scoreAge,
    scoreDueDate,
    scoreKeywords,
    scoreLabels,
    scoreStale,
    scoreBlocked,
  ];

  for (const scorer of scorers) {
    const result = scorer(task);
    totalScore += result.score;
    if (result.reason) {
      reasons.push(result.reason);
    }
  }

  // Clamp score to 0-1 range
  const clampedScore = Math.min(Math.max(totalScore, 0), 1);

  // Sort reasons by contribution (highest first)
  reasons.sort((a, b) => b.contribution - a.contribution);

  return {
    score: clampedScore,
    reasons,
  };
}

/**
 * Check if two priorities are different enough to suggest a change
 */
export function shouldSuggestChange(
  current: TaskPriority,
  suggested: TaskPriority
): boolean {
  // Always suggest if priorities are different
  return current !== suggested;
}
