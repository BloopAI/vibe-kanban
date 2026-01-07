import { DiffFileLineType } from "@git-diff-view/core";
import * as React from "react";

import { DiffSplitContentLine } from "./DiffSplitContentLineNormal_v2";
import { DiffSplitExtendLine } from "./DiffSplitExtendLineNormal_v2";
import { DiffSplitHunkLine } from "./DiffSplitHunkLineNormal_v2";
import { DiffSplitWidgetLine } from "./DiffSplitWidgetLineNormal_v2";

import type { SplitSide } from "../DiffView";
import type { DiffFile, DiffSplitLineItem } from "@git-diff-view/core";

export const DiffSplitViewLine = ({
  line,
  side,
  diffFile,
}: {
  line: DiffSplitLineItem;
  side: SplitSide;
  diffFile: DiffFile;
}) => {
  switch (line.type) {
    case DiffFileLineType.hunk:
      return <DiffSplitHunkLine side={side} index={line.index} lineNumber={line.lineNumber} diffFile={diffFile} />;
    case DiffFileLineType.content:
      return <DiffSplitContentLine side={side} index={line.index} lineNumber={line.lineNumber} diffFile={diffFile} />;
    case DiffFileLineType.widget:
      return <DiffSplitWidgetLine side={side} index={line.index} lineNumber={line.lineNumber} diffFile={diffFile} />;
    case DiffFileLineType.extend:
      return <DiffSplitExtendLine side={side} index={line.index} lineNumber={line.lineNumber} diffFile={diffFile} />;
    default:
      return null;
  }
};
