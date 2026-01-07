import { DiffFileLineType } from "@git-diff-view/core";
import * as React from "react";

import { DiffSplitContentLine } from "./DiffSplitContentLineWrap_v2";
import { DiffSplitExtendLine } from "./DiffSplitExtendLineWrap_v2";
import { DiffSplitHunkLine } from "./DiffSplitHunkLineWrap_v2";
import { DiffSplitWidgetLine } from "./DiffSplitWidgetLineWrap_v2";

import type { DiffFile, DiffSplitLineItem } from "@git-diff-view/core";

export const DiffSplitViewLine = ({ line, diffFile }: { line: DiffSplitLineItem; diffFile: DiffFile }) => {
  switch (line.type) {
    case DiffFileLineType.hunk:
      return <DiffSplitHunkLine index={line.index} lineNumber={line.lineNumber} diffFile={diffFile} />;
    case DiffFileLineType.content:
      return <DiffSplitContentLine index={line.index} lineNumber={line.lineNumber} diffFile={diffFile} />;
    case DiffFileLineType.widget:
      return <DiffSplitWidgetLine index={line.index} lineNumber={line.lineNumber} diffFile={diffFile} />;
    case DiffFileLineType.extend:
      return <DiffSplitExtendLine index={line.index} lineNumber={line.lineNumber} diffFile={diffFile} />;
    default:
      return null;
  }
};
