import { useMemo } from 'react';
import {
  StackIcon,
  SlidersIcon,
  SquaresFourIcon,
  GitBranchIcon,
} from '@phosphor-icons/react';
import type { Workspace } from 'shared/types';
import {
  Pages,
  type PageId,
  type StaticPageId,
  type CommandBarGroup,
  type CommandBarGroupItem,
  type ResolvedGroup,
  type ResolvedGroupItem,
} from '@/components/ui-new/actions/pages';
import type { ActionVisibilityContext } from '@/components/ui-new/actions';
import {
  isActionVisible,
  isPageVisible,
} from '@/components/ui-new/actions/useActionVisibility';
import { injectSearchMatches } from './injectSearchMatches';

/** Resolved page structure passed to CommandBar */
export interface ResolvedCommandBarPage {
  id: string;
  title?: string;
  groups: ResolvedGroup[];
}

/** Repo type from workspace context */
interface Repo {
  id: string;
  display_name: string;
}

/** Icons for each page type */
const PAGE_ICONS: Record<StaticPageId, typeof StackIcon> = {
  root: SquaresFourIcon,
  workspaceActions: StackIcon,
  diffOptions: SlidersIcon,
  viewOptions: SquaresFourIcon,
  gitActions: GitBranchIcon,
};

/**
 * Build the dynamic selectRepo page
 */
function buildSelectRepoPage(repos: Repo[]): ResolvedCommandBarPage {
  return {
    id: 'selectRepo',
    title: 'Select Repository',
    groups: [
      {
        label: 'Repositories',
        items: repos.map((repo) => ({
          type: 'repo' as const,
          repo: { id: repo.id, display_name: repo.display_name },
        })),
      },
    ],
  };
}

/**
 * Expand a single group's items, handling childPages markers
 */
function expandGroupItems(
  items: CommandBarGroupItem[],
  visibilityContext: ActionVisibilityContext
): ResolvedGroupItem[] {
  return items.flatMap((item): ResolvedGroupItem[] => {
    if (item.type === 'childPages') {
      const childPage = Pages[item.id as StaticPageId];
      if (!isPageVisible(childPage, visibilityContext)) {
        return [];
      }
      return [
        {
          type: 'page' as const,
          pageId: item.id,
          label: childPage.title ?? item.id,
          icon: PAGE_ICONS[item.id as StaticPageId],
        },
      ];
    }

    if (item.type === 'action') {
      if (!isActionVisible(item.action, visibilityContext)) {
        return [];
      }
    }

    return [item];
  });
}

/**
 * Build resolved groups from a static page
 */
function buildPageGroups(
  pageId: StaticPageId,
  visibilityContext: ActionVisibilityContext
): ResolvedGroup[] {
  const basePage = Pages[pageId];

  return basePage.items
    .map((group: CommandBarGroup): ResolvedGroup | null => {
      const resolvedItems = expandGroupItems(group.items, visibilityContext);
      if (resolvedItems.length === 0) return null;
      return { label: group.label, items: resolvedItems };
    })
    .filter((group): group is ResolvedGroup => group !== null);
}

/**
 * Hook to resolve the current page into renderable data.
 * Handles static pages, dynamic selectRepo page, and search injection.
 */
export function useResolvedPage(
  pageId: PageId,
  search: string,
  visibilityContext: ActionVisibilityContext,
  workspace: Workspace | undefined,
  repos: Repo[]
): ResolvedCommandBarPage {
  return useMemo(() => {
    // Dynamic repo selection page
    if (pageId === 'selectRepo') {
      return buildSelectRepoPage(repos);
    }

    const staticPageId = pageId as StaticPageId;
    const basePage = Pages[staticPageId];
    const groups = buildPageGroups(staticPageId, visibilityContext);

    // Inject search results from nested pages when on root
    if (pageId === 'root' && search.trim()) {
      const injected = injectSearchMatches(
        search,
        visibilityContext,
        workspace
      );
      groups.push(...injected);
    }

    return {
      id: basePage.id,
      title: basePage.title,
      groups,
    };
  }, [pageId, search, visibilityContext, workspace, repos]);
}
