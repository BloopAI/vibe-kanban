import { numIterator } from ".";

import type { SplitLineItem, UnifiedLineItem, DiffFile } from ".";

export enum DiffFileLineType {
  hunk = 1,
  content = 2,
  widget = 3,
  extend = 4,
}

export enum SplitSide {
  old = 1,
  new = 2,
}

export type DiffSplitContentLineItem = {
  type: DiffFileLineType.content;
  index: number;
  lineNumber: number;
  splitLine: { left: SplitLineItem; right: SplitLineItem };
};

export type DiffUnifiedContentLineItem = {
  type: DiffFileLineType.content;
  index: number;
  lineNumber: number;
  unifiedLine: UnifiedLineItem;
};

export type DiffSplitLineItem = {
  type: DiffFileLineType;
  index: number;
  lineNumber: number;
};

export type DiffUnifiedLineItem = {
  type: DiffFileLineType;
  index: number;
  lineNumber: number;
};

export const getSplitLines = (diffFile: DiffFile): DiffSplitLineItem[] => {
  const splitLineLength = diffFile.splitLineLength;

  const splitLines: DiffSplitLineItem[] = [];

  numIterator(splitLineLength, (index) => {
    splitLines.push({ type: DiffFileLineType.hunk, index, lineNumber: index + 1 });

    splitLines.push({
      type: DiffFileLineType.content,
      index,
      lineNumber: index + 1,
    });

    splitLines.push({ type: DiffFileLineType.widget, index, lineNumber: index + 1 });

    splitLines.push({ type: DiffFileLineType.extend, index, lineNumber: index + 1 });
  });

  return splitLines;
};

export const getSplitContentLines = (diffFile: DiffFile): DiffSplitContentLineItem[] => {
  const splitLineLength = diffFile.splitLineLength;

  const splitLines: DiffSplitContentLineItem[] = [];

  numIterator(splitLineLength, (index) => {
    const splitLeftLine = diffFile.getSplitLeftLine(index);

    const splitRightLine = diffFile.getSplitRightLine(index);

    if (!splitLeftLine?.isHidden && !splitRightLine?.isHidden) {
      {
        splitLines.push({
          type: DiffFileLineType.content,
          index,
          lineNumber: index + 1,
          splitLine: { left: splitLeftLine, right: splitRightLine },
        });
      }
    }
  });

  return splitLines;
};

export const getUnifiedLines = (diffFile: DiffFile): DiffUnifiedLineItem[] => {
  const unifiedLineLength = diffFile.unifiedLineLength;

  const unifiedLines: DiffUnifiedLineItem[] = [];

  numIterator(unifiedLineLength, (index) => {
    unifiedLines.push({ type: DiffFileLineType.hunk, index, lineNumber: index + 1 });

    unifiedLines.push({ type: DiffFileLineType.content, index, lineNumber: index + 1 });

    unifiedLines.push({ type: DiffFileLineType.widget, index, lineNumber: index + 1 });

    unifiedLines.push({ type: DiffFileLineType.extend, index, lineNumber: index + 1 });
  });

  return unifiedLines;
};

export const getUnifiedContentLine = (diffFile: DiffFile): DiffUnifiedContentLineItem[] => {
  const unifiedLineLength = diffFile.unifiedLineLength;

  const unifiedLines: DiffUnifiedContentLineItem[] = [];

  numIterator(unifiedLineLength, (index) => {
    const unifiedLine = diffFile.getUnifiedLine(index);

    if (!unifiedLine.isHidden) {
      unifiedLines.push({ type: DiffFileLineType.content, index, lineNumber: index + 1, unifiedLine: unifiedLine });
    }
  });

  return unifiedLines;
};

export const checkCurrentLineIsHidden = (diffFile: DiffFile, lineNumber: number, side: SplitSide) => {
  const splitLine = diffFile.getSplitLineByLineNumber(lineNumber, side);

  const unifiedLine = diffFile.getUnifiedLineByLineNumber(lineNumber, side);

  return {
    split: !splitLine || splitLine.isHidden,
    unified: !unifiedLine || unifiedLine.isHidden,
  };
};
