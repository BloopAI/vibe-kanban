import { borderColorName, emptyBGName } from "@git-diff-view/utils";
import * as React from "react";

import { SplitSide } from "../DiffView";
import { useDiffViewContext } from "../DiffViewContext";
import { useDiffWidgetContext } from "../DiffWidgetContext";

import type { DiffFile } from "@git-diff-view/core";

const InternalDiffSplitWidgetLine = ({
  index,
  diffFile,
  lineNumber,
  oldLineWidget,
  newLineWidget,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
  oldLineWidget: boolean;
  newLineWidget: boolean;
}) => {
  const { useWidget } = useDiffWidgetContext();

  const setWidget = useWidget.getReadonlyState().setWidget;

  const { useDiffContext } = useDiffViewContext();

  const renderWidgetLine = useDiffContext.useShallowStableSelector((s) => s.renderWidgetLine);

  const oldLine = diffFile.getSplitLeftLine(index);

  const newLine = diffFile.getSplitRightLine(index);

  if (!renderWidgetLine) return null;

  const oldWidgetRendered =
    oldLineWidget &&
    renderWidgetLine?.({
      diffFile,
      side: SplitSide.old,
      lineNumber: oldLine.lineNumber,
      onClose: () => setWidget({}),
    });

  const newWidgetRendered =
    newLineWidget &&
    renderWidgetLine?.({
      diffFile,
      side: SplitSide.new,
      lineNumber: newLine.lineNumber,
      onClose: () => setWidget({}),
    });

  return (
    <div data-line={`${lineNumber}-widget`} data-state="widget" className="diff-line diff-line-widget flex">
      {oldWidgetRendered ? (
        <div className="diff-line-widget-old-content w-[50%] p-0">
          <div className="diff-line-widget-wrapper">{oldWidgetRendered}</div>
        </div>
      ) : (
        <div
          className="diff-line-widget-old-placeholder w-[50%] select-none p-0"
          style={{ backgroundColor: `var(${emptyBGName})` }}
        />
      )}
      <div className="diff-split-line w-[1px] flex-shrink-0" style={{ backgroundColor: `var(${borderColorName})` }} />
      {newWidgetRendered ? (
        <div className="diff-line-widget-new-content w-[50%] p-0">
          <div className="diff-line-widget-wrapper">{newWidgetRendered}</div>
        </div>
      ) : (
        <div
          className="diff-line-widget-new-placeholder w-[50%] select-none p-0"
          style={{ backgroundColor: `var(${emptyBGName})` }}
        />
      )}
    </div>
  );
};

export const DiffSplitWidgetLine = ({
  index,
  diffFile,
  lineNumber,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
}) => {
  const { useWidget } = useDiffWidgetContext();

  const { widgetLineNumber, widgetSide } = useWidget.useShallowStableSelector((s) => ({
    widgetLineNumber: s.widgetLineNumber,
    widgetSide: s.widgetSide,
  }));

  const oldLine = diffFile.getSplitLeftLine(index);

  const newLine = diffFile.getSplitRightLine(index);

  const oldLineWidget = oldLine.lineNumber && widgetSide === SplitSide.old && widgetLineNumber === oldLine.lineNumber;

  const newLineWidget = newLine.lineNumber && widgetSide === SplitSide.new && widgetLineNumber === newLine.lineNumber;

  const currentIsShow = oldLineWidget || newLineWidget;

  if (!currentIsShow) return null;

  return (
    <InternalDiffSplitWidgetLine
      index={index}
      diffFile={diffFile}
      lineNumber={lineNumber}
      oldLineWidget={oldLineWidget}
      newLineWidget={newLineWidget}
    />
  );
};
