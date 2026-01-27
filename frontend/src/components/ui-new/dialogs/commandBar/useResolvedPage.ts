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
} from '@/components/ui-new/actions/pages';
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

export function useResolvedPage(
  pageId: PageId,
  search: string,
  ctx: ActionVisibilityContext,
  workspace: Workspace | undefined,
  repos: RepoItem[],
  statuses: StatusItem[]
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

    const groups = buildPageGroups(pageId as StaticPageId, ctx);
    if (pageId === 'root' && search.trim()) {
      groups.push(...injectSearchMatches(search, ctx, workspace));
    }

    return {
      id: Pages[pageId as StaticPageId].id,
      title: Pages[pageId as StaticPageId].title,
      groups,
    };
  }, [pageId, search, ctx, workspace, repos, statuses]);
}
