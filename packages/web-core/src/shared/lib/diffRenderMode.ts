import type { Diff } from 'shared/types';

export const LARGE_DIFF_THRESHOLD = 800;
export const LARGE_DIFF_PLACEHOLDER_HEIGHT = 56;

export function getRawDiffLineCount(
  diff: Pick<Diff, 'additions' | 'deletions'>
) {
  return (diff.additions ?? 0) + (diff.deletions ?? 0);
}

export function shouldUseLargeDiffPlaceholder(
  diff: Pick<Diff, 'additions' | 'deletions'>,
  forceExpanded: boolean
) {
  return getRawDiffLineCount(diff) > LARGE_DIFF_THRESHOLD && !forceExpanded;
}
