import type { Workspace } from 'shared/types';
import {
  Pages,
  getPageActions,
  type StaticPageId,
  type ResolvedGroup,
} from '@/components/ui-new/actions/pages';
import {
  resolveLabel,
  type ActionVisibilityContext,
} from '@/components/ui-new/actions';
import { isActionVisible } from '@/components/ui-new/actions/useActionVisibility';

const INJECTABLE_PAGES: Array<{
  id: StaticPageId;
  condition: (ctx: ActionVisibilityContext) => boolean;
}> = [
  { id: 'workspaceActions', condition: (ctx) => ctx.hasWorkspace },
  { id: 'diffOptions', condition: () => true },
  { id: 'viewOptions', condition: () => true },
  { id: 'repoActions', condition: (ctx) => ctx.hasGitRepos },
];

export function injectSearchMatches(
  searchQuery: string,
  ctx: ActionVisibilityContext,
  workspace: Workspace | undefined
): ResolvedGroup[] {
  const searchLower = searchQuery.toLowerCase();

  return INJECTABLE_PAGES.reduce<ResolvedGroup[]>(
    (groups, { id, condition }) => {
      if (!condition(ctx)) return groups;

      const items = getPageActions(id)
        .filter((a) => isActionVisible(a, ctx))
        .filter((a) => {
          const label = resolveLabel(a, workspace);
          return (
            label.toLowerCase().includes(searchLower) ||
            a.id.toLowerCase().includes(searchLower)
          );
        })
        .map((action) => ({ type: 'action' as const, action }));

      if (items.length) groups.push({ label: Pages[id].title || id, items });
      return groups;
    },
    []
  );
}
