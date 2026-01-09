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

/** Pages to inject when searching from root */
const INJECTABLE_PAGES: Array<{
  id: StaticPageId;
  condition: (ctx: ActionVisibilityContext) => boolean;
}> = [
  { id: 'workspaceActions', condition: (ctx) => ctx.hasWorkspace },
  { id: 'diffOptions', condition: () => true },
  { id: 'viewOptions', condition: () => true },
  { id: 'gitActions', condition: (ctx) => ctx.hasGitRepos },
];

/**
 * Inject matching actions from nested pages when searching on root.
 * Replaces 100+ lines of duplicated code with a single loop.
 */
export function injectSearchMatches(
  searchQuery: string,
  visibilityContext: ActionVisibilityContext,
  workspace: Workspace | undefined
): ResolvedGroup[] {
  const groups: ResolvedGroup[] = [];
  const searchLower = searchQuery.toLowerCase();

  for (const { id, condition } of INJECTABLE_PAGES) {
    if (!condition(visibilityContext)) continue;

    const actions = getPageActions(id)
      .filter((action) => isActionVisible(action, visibilityContext))
      .filter((action) => {
        const label = resolveLabel(action, workspace);
        return (
          label.toLowerCase().includes(searchLower) ||
          action.id.toLowerCase().includes(searchLower)
        );
      });

    if (actions.length > 0) {
      groups.push({
        label: Pages[id].title || id,
        items: actions.map((action) => ({ type: 'action' as const, action })),
      });
    }
  }

  return groups;
}
