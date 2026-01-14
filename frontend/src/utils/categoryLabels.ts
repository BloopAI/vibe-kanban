/**
 * Bird's eye category labels for task cards
 * Categories help users quickly identify the type of work involved
 */

export type TaskCategory =
  | 'feature'
  | 'bugfix'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'chore'
  | 'design';

export interface CategoryConfig {
  label: string;
  icon: string;
  /** CSS variable name for the category color */
  colorVar: string;
  /** Hex color for direct styling */
  color: string;
}

export const categoryConfig: Record<TaskCategory, CategoryConfig> = {
  feature: {
    label: 'Feature',
    icon: '✨',
    colorVar: '--info',
    color: '#3b82f6', // blue
  },
  bugfix: {
    label: 'Bug Fix',
    icon: '🐛',
    colorVar: '--error',
    color: '#ef4444', // red
  },
  refactor: {
    label: 'Refactor',
    icon: '♻️',
    colorVar: '--warning',
    color: '#f59e0b', // amber
  },
  docs: {
    label: 'Docs',
    icon: '📝',
    colorVar: '--success',
    color: '#10b981', // emerald
  },
  test: {
    label: 'Test',
    icon: '🧪',
    colorVar: '--brand',
    color: '#8b5cf6', // violet
  },
  chore: {
    label: 'Chore',
    icon: '🔧',
    colorVar: '--neutral-foreground',
    color: '#6b7280', // gray
  },
  design: {
    label: 'Design',
    icon: '🎨',
    colorVar: '--brand',
    color: '#ec4899', // pink
  },
};

/** Keywords used to detect task categories from title/description */
const categoryKeywords: Record<TaskCategory, string[]> = {
  feature: [
    'add',
    'implement',
    'create',
    'new',
    'feature',
    'build',
    'introduce',
    'enable',
    'support',
    'integrate',
    'display',
    'show',
  ],
  bugfix: [
    'fix',
    'bug',
    'issue',
    'error',
    'broken',
    'crash',
    'fail',
    'wrong',
    'incorrect',
    'resolve',
    'patch',
    'repair',
    'debug',
  ],
  refactor: [
    'refactor',
    'restructure',
    'reorganize',
    'clean',
    'improve',
    'optimize',
    'simplify',
    'extract',
    'move',
    'rename',
    'update',
    'upgrade',
    'migrate',
  ],
  docs: [
    'doc',
    'readme',
    'documentation',
    'comment',
    'guide',
    'tutorial',
    'explain',
    'describe',
    'jsdoc',
    'typedoc',
  ],
  test: [
    'test',
    'spec',
    'coverage',
    'jest',
    'vitest',
    'cypress',
    'e2e',
    'unit test',
    'integration test',
    'mock',
  ],
  chore: [
    'chore',
    'config',
    'setup',
    'ci',
    'cd',
    'pipeline',
    'dependency',
    'deps',
    'package',
    'lint',
    'format',
    'eslint',
    'prettier',
  ],
  design: [
    'design',
    'ui',
    'ux',
    'style',
    'css',
    'theme',
    'layout',
    'visual',
    'responsive',
    'animation',
    'color',
    'icon',
    'font',
  ],
};

/**
 * Infers the task category from the task title and optional description
 * Uses keyword matching with priority order
 */
export function inferTaskCategory(
  title: string,
  description?: string | null
): TaskCategory | null {
  const text = `${title} ${description || ''}`.toLowerCase();

  // Priority order for detection (most specific first)
  const categoryPriority: TaskCategory[] = [
    'bugfix',
    'test',
    'docs',
    'design',
    'refactor',
    'chore',
    'feature',
  ];

  for (const category of categoryPriority) {
    const keywords = categoryKeywords[category];
    for (const keyword of keywords) {
      // Word boundary check for more accurate matching
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(text)) {
        return category;
      }
    }
  }

  return null;
}

/**
 * Returns the category configuration for a given category
 */
export function getCategoryConfig(category: TaskCategory): CategoryConfig {
  return categoryConfig[category];
}

/**
 * Returns category border color for card styling
 */
export function getCategoryBorderColor(category: TaskCategory): string {
  return categoryConfig[category].color;
}
