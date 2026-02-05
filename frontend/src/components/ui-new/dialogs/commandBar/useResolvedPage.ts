import { useMemo } from 'react';
import {
  StackIcon,
  SlidersIcon,
  SquaresFourIcon,
  GitBranchIcon,
  KanbanIcon,
} from '@phosphor-icons/react';
import type { Workspace } from 'shared/types';
import {
  Pages,
  type PageId,
  type StaticPageId,
  type CommandBarGroupItem,
  type ResolvedGroup,
  type ResolvedGroupItem,
  type RepoItem,
  type StatusItem,
  type PriorityItem,
} from '@/components/ui-new/actions/pages';
import type { Issue } from 'shared/remote-types';
import type { ActionVisibilityContext } from '@/components/ui-new/actions';
import {
  isActionVisible,
  isPageVisible,
} from '@/components/ui-new/actions/useActionVisibility';
import { injectSearchMatches } from './injectSearchMatches';

export interface ResolvedCommandBarPage {
  id: string;
  title?: string;
  groups: ResolvedGroup[];
}

const PAGE_ICONS = {
  root: SquaresFourIcon,
  workspaceActions: StackIcon,
  diffOptions: SlidersIcon,
  viewOptions: SquaresFourIcon,
  repoActions: GitBranchIcon,
  issueActions: KanbanIcon,
} as const satisfies Record<StaticPageId, typeof StackIcon>;

function expandGroupItems(
  items: CommandBarGroupItem[],
  ctx: ActionVisibilityContext
): ResolvedGroupItem[] {
  return items.flatMap((item) => {
    if (item.type === 'childPages') {
      const page = Pages[item.id as StaticPageId];
      if (!isPageVisible(page, ctx)) return [];
      return [
        {
          type: 'page' as const,
          pageId: item.id,
          label: page.title ?? item.id,
          icon: PAGE_ICONS[item.id as StaticPageId],
        },
      ];
    }
    if (item.type === 'action' && !isActionVisible(item.action, ctx)) return [];
    return [item];
  });
}

function buildPageGroups(
  pageId: StaticPageId,
  ctx: ActionVisibilityContext
): ResolvedGroup[] {
  return Pages[pageId].items
    .map((group) => {
      const items = expandGroupItems(group.items, ctx);
      return items.length ? { label: group.label, items } : null;
    })
    .filter((g): g is ResolvedGroup => g !== null);
}

// Static priority items
const PRIORITY_ITEMS: PriorityItem[] = [
  { id: null, name: 'No priority' },
  { id: 'urgent', name: 'Urgent' },
  { id: 'high', name: 'High' },
  { id: 'medium', name: 'Medium' },
  { id: 'low', name: 'Low' },
];

export function useResolvedPage(
  pageId: PageId,
  search: string,
  ctx: ActionVisibilityContext,
  workspace: Workspace | undefined,
  repos: RepoItem[],
  statuses: StatusItem[],
  issues: Issue[] = [],
  subIssueMode?: 'addChild' | 'setParent'
): ResolvedCommandBarPage {
  return useMemo(() => {
    if (pageId === 'selectRepo') {
      return {
        id: 'selectRepo',
        title: 'Select Repository',
        groups: [
          {
            label: 'Repositories',
            items: repos.map((r) => ({ type: 'repo' as const, repo: r })),
          },
        ],
      };
    }

    if (pageId === 'selectStatus') {
      return {
        id: 'selectStatus',
        title: 'Select Status',
        groups: [
          {
            label: 'Statuses',
            items: statuses.map((s) => ({
              type: 'status' as const,
              status: s,
            })),
          },
        ],
      };
    }

    if (pageId === 'selectPriority') {
      return {
        id: 'selectPriority',
        title: 'Select Priority',
        groups: [
          {
            label: 'Priority',
            items: PRIORITY_ITEMS.map((p) => ({
              type: 'priority' as const,
              priority: p,
            })),
          },
        ],
      };
    }

    if (pageId === 'selectSubIssue') {
      const title =
        subIssueMode === 'setParent' ? 'Make Sub-issue of' : 'Add Sub-issue';
      return {
        id: 'selectSubIssue',
        title,
        groups: [
          {
            label: 'Issues',
            items: [
              ...(subIssueMode === 'addChild'
                ? [{ type: 'createSubIssue' as const }]
                : []),
              ...issues.map((issue) => ({
                type: 'issue' as const,
                issue,
              })),
            ],
          },
        ],
      };
    }

    if (pageId === 'selectRelationshipIssue') {
      return {
        id: 'selectRelationshipIssue',
        title: 'Select Issue',
        groups: [
          {
            label: 'Issues',
            items: issues.map((issue) => ({
              type: 'issue' as const,
              issue,
            })),
          },
        ],
      };
    }

    const groups = buildPageGroups(pageId as StaticPageId, ctx);
    if (pageId === 'root' && search.trim()) {
      groups.push(...injectSearchMatches(search, ctx, workspace));
    }

    return {
      id: Pages[pageId as StaticPageId].id,
      title: Pages[pageId as StaticPageId].title,
      groups,
    };
  }, [pageId, search, ctx, workspace, repos, statuses, issues, subIssueMode]);
}
