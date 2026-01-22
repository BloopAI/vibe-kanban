const DIFF_LINE_HEIGHT_PX = 28;
const DIFF_BODY_MIN_HEIGHT_PX = 120;
const DIFF_BODY_MAX_HEIGHT_PX = 28000;
const DIFF_HEADER_HEIGHT_PX = 56;
const DIFF_LINE_COUNT_FALLBACK = 12;
const DIFF_CONTEXT_LINES_PER_HUNK = 6;
const DIFF_LINES_PER_HUNK_ESTIMATE = 20;

export function estimateDiffLineCount(
  additions: number | null | undefined,
  deletions: number | null | undefined
): number {
  const total = (additions ?? 0) + (deletions ?? 0);
  if (total <= 0) return DIFF_LINE_COUNT_FALLBACK;

  const hunkCount = Math.max(
    1,
    Math.ceil(total / DIFF_LINES_PER_HUNK_ESTIMATE)
  );
  return total + hunkCount * DIFF_CONTEXT_LINES_PER_HUNK;
}

export function estimateDiffBodyHeightPx(lineCount: number): number {
  const raw = lineCount * DIFF_LINE_HEIGHT_PX;
  return Math.min(
    Math.max(raw, DIFF_BODY_MIN_HEIGHT_PX),
    DIFF_BODY_MAX_HEIGHT_PX
  );
}

export function estimateDiffItemHeightPx(lineCount: number): number {
  return DIFF_HEADER_HEIGHT_PX + estimateDiffBodyHeightPx(lineCount);
}
