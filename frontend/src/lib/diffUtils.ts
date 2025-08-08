import { EditDiff, WorktreeDiff, DiffChunk } from 'shared/types';
import { diffTrimmedLines, parsePatch } from 'diff';

/**
 * Parse unified diff using industry-standard jsdiff library
 */
export function parseUnifiedDiff(unifiedDiff: string): DiffChunk[] {
  try {
    const patches = parsePatch(unifiedDiff);
    const chunks: DiffChunk[] = [];

    for (const patch of patches) {
      for (const hunk of patch.hunks) {
        for (const line of hunk.lines) {
          const firstChar = line.charAt(0);
          let chunkType: 'Equal' | 'Insert' | 'Delete';
          let content = line.slice(1); // Remove the +/- prefix

          if (firstChar === '+') {
            chunkType = 'Insert';
          } else if (firstChar === '-') {
            chunkType = 'Delete';
          } else {
            chunkType = 'Equal';
          }

          chunks.push({ chunk_type: chunkType, content });
        }
      }
    }

    return chunks;
  } catch {
    return [];
  }
}

/**
 * Generate line-by-line diff chunks using jsdiff
 */
export function parseReplaceDiff(
  oldContent: string,
  newContent: string
): DiffChunk[] {
  const changes = diffTrimmedLines(oldContent, newContent, {
    stripTrailingCr: true,
    ignoreWhitespace: true,
    oneChangePerToken: true,
  });

  return changes.map((change) => ({
    chunk_type: change.added ? 'Insert' : change.removed ? 'Delete' : 'Equal',
    content: change.value,
  }));
}

/**
 * Convert EditDiff to WorktreeDiff format for consistent rendering
 */
export function editDiffToWorktreeDiff(
  path: string,
  editDiff: EditDiff
): WorktreeDiff {
  const chunks =
    editDiff.format === 'unified'
      ? parseUnifiedDiff(editDiff.unified_diff)
      : parseReplaceDiff(editDiff.old, editDiff.new);

  return {
    files: [{ path, chunks }],
  };
}

/**
 * Check if EditDiff has meaningful content
 */
export function hasEditDiffContent(editDiff: EditDiff): boolean {
  if (editDiff.format === 'unified') {
    return editDiff.unified_diff.trim().length > 0;
  } else {
    return editDiff.old.trim().length > 0 || editDiff.new.trim().length > 0;
  }
}
