import type { ConflictOp } from 'shared/types';

export function buildResolveConflictsInstructions(
  sourceBranch: string | null,
  baseBranch: string | undefined,
  conflictedFiles: string[],
  op?: ConflictOp | null
): string {
  const source = sourceBranch || 'current attempt branch';
  const base = baseBranch ?? 'base branch';
  const filesList = conflictedFiles.slice(0, 12);
  const filesBlock = filesList.length
    ? `\n\nFiles with conflicts:\n${filesList.map((f) => `- ${f}`).join('\n')}`
    : '';

  const opTitle: string =
    op === 'merge'
      ? 'Merge'
      : op === 'cherry_pick'
        ? 'Cherry-pick'
        : op === 'revert'
          ? 'Revert'
          : 'Rebase';

  const header =
    op === 'merge'
      ? `Merge conflicts while merging into '${source}'.`
      : op === 'cherry_pick'
        ? `Cherry-pick conflicts on '${source}'.`
        : op === 'revert'
          ? `Revert conflicts on '${source}'.`
          : `Rebase conflicts while rebasing '${source}' onto '${base}'.`;

  return (
    `${header}` +
    filesBlock +
    `\n\nPlease resolve each file carefully. When continuing, ensure the ${opTitle.toLowerCase()} does not hang (set \`GIT_EDITOR=true\` or use a non-interactive editor).`
  );
}
