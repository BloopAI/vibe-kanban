import { relativeChanges } from "./change-range";
import { DiffLineType } from "./diff-line";
import { DiffHunkExpansionType } from "./raw-diff";
import { getPlainDiffTemplate, getSyntaxDiffTemplate } from "./template";

import type { SyntaxLineWithTemplate } from "../file";
import type { DiffLine } from "./diff-line";
import type { DiffHunk, DiffHunkHeader } from "./raw-diff";

/** How many new lines will be added to a diff hunk by default. */
export const DefaultDiffExpansionStep = 40;

export function assertNever(_: never, message: string): never {
  throw new Error(message);
}

/** Utility function for getting the digit count of the largest line number in an array of diff hunks */
export function getLargestLineNumber(hunks: DiffHunk[]): number {
  if (hunks.length === 0) {
    return 0;
  }

  for (let i = hunks.length - 1; i >= 0; i--) {
    const hunk = hunks[i];

    for (let j = hunk.lines.length - 1; j >= 0; j--) {
      const line = hunk.lines[j];

      if (line.type === DiffLineType.Hunk) {
        continue;
      }

      const newLineNumber = line.newLineNumber ?? 0;
      const oldLineNumber = line.oldLineNumber ?? 0;
      return newLineNumber > oldLineNumber ? newLineNumber : oldLineNumber;
    }
  }

  return 0;
}

/**
 * Calculates whether or not a hunk header can be expanded up, down, both, or if
 * the space represented by the hunk header is short and expansion there would
 * mean merging with the hunk above.
 *
 * @param hunkIndex     Index of the hunk to evaluate within the whole diff.
 * @param hunkHeader    Header of the hunk to evaluate.
 * @param previousHunk  Hunk previous to the one to evaluate. Null if the
 *                      evaluated hunk is the first one.
 */
export function getHunkHeaderExpansionType(
  hunkIndex: number,
  hunkHeader: DiffHunkHeader,
  previousHunk: DiffHunk | null
): DiffHunkExpansionType {
  const distanceToPrevious =
    previousHunk === null
      ? Infinity
      : hunkHeader.oldStartLine - previousHunk.header.oldStartLine - previousHunk.header.oldLineCount;

  // In order to simplify the whole logic around expansion, only the hunk at the
  // top can be expanded up exclusively, and only the hunk at the bottom (the
  // dummy one, see getTextDiffWithBottomDummyHunk) can be expanded down
  // exclusively.
  // The rest of the hunks can be expanded both ways, except those which are too
  // short and therefore the direction of expansion doesn't matter.
  if (hunkIndex === 0) {
    // The top hunk can only be expanded if there is content above it
    if (hunkHeader.oldStartLine > 1 && hunkHeader.newStartLine > 1) {
      return DiffHunkExpansionType.Up;
    } else {
      return DiffHunkExpansionType.None;
    }
  } else if (distanceToPrevious <= DefaultDiffExpansionStep) {
    return DiffHunkExpansionType.Short;
  } else {
    return DiffHunkExpansionType.Both;
  }
}

export const numIterator = <T>(num: number, cb: (index: number) => T): T[] => {
  const re = [];
  for (let i = 0; i < num; i++) {
    re.push(cb(i));
  }
  return re;
};

export const getLang = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf(".");
  const extension = fileName.slice(dotIndex + 1);
  return extension;
};

export const getDiffRange = (
  additions: DiffLine[],
  deletions: DiffLine[],
  {
    getAdditionRaw,
    getDeletionRaw,
    getAdditionSyntax,
    getDeletionSyntax,
  }: {
    getAdditionRaw: (lineNumber: number) => string;
    getDeletionRaw: (lineNumber: number) => string;
    getAdditionSyntax: (lineNumber: number) => SyntaxLineWithTemplate;
    getDeletionSyntax: (lineNumber: number) => SyntaxLineWithTemplate;
  }
) => {
  if (additions.length === deletions.length) {
    const len = additions.length;
    for (let i = 0; i < len; i++) {
      const addition = additions[i];
      const deletion = deletions[i];
      if (!addition.changes || !deletion.changes) {
        // use the original text content to computed diff range
        // fix: get diff with ignoreWhiteSpace config
        const _addition = addition.clone(getAdditionRaw(addition.newLineNumber) || addition.text || "");
        const _deletion = deletion.clone(getDeletionRaw(deletion.oldLineNumber) || deletion.text || "");
        const { addRange, delRange } = relativeChanges(_addition, _deletion);
        addition.changes = addRange;
        deletion.changes = delRange;
      }
      if (!addition.plainTemplate || !deletion.plainTemplate) {
        getPlainDiffTemplate({ diffLine: addition, rawLine: getAdditionRaw(addition.newLineNumber), operator: "add" });
        getPlainDiffTemplate({ diffLine: deletion, rawLine: getDeletionRaw(deletion.oldLineNumber), operator: "del" });
      }
      if (!addition.syntaxTemplate || !deletion.syntaxTemplate) {
        getSyntaxDiffTemplate({
          diffLine: addition,
          syntaxLine: getAdditionSyntax(addition.newLineNumber),
          operator: "add",
        });
        getSyntaxDiffTemplate({
          diffLine: deletion,
          syntaxLine: getDeletionSyntax(deletion.oldLineNumber),
          operator: "del",
        });
      }

      // TODO! support word diff
      // const { addRange: _addRange, delRange: _delRange } = diffChanges(_addition, _deletion);
      // addition.diffChanges = _addRange;
      // deletion.diffChanges = _delRange;
    }
  }
};
