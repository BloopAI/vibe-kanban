import { borderColorName, emptyBGName } from "@git-diff-view/utils";
import * as React from "react";

import { SplitSide } from "..";

import { useDiffViewContext } from "./DiffViewContext";
import { useDiffWidgetContext } from "./DiffWidgetContext";

import type { DiffFile } from "@git-diff-view/core";

const InternalDiffSplitWidgetLine = ({
  index,
  diffFile,
  lineNumber,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
}) => {
  const { useWidget } = useDiffWidgetContext();

  const setWidget = useWidget.getReadonlyState().setWidget;

  const { useDiffContext } = useDiffViewContext();

  const renderWidgetLine = useDiffContext.useShallowStableSelector((s) => s.renderWidgetLine);

  const oldLine = diffFile.getSplitLeftLine(index);

  const newLine = diffFile.getSplitRightLine(index);

  const widgetSide = useWidget.useShallowStableSelector((s) => s.widgetSide);

  const widgetLineNumber = useWidget.getReadonlyState().widgetLineNumber;

  const oldLineWidget = oldLine.lineNumber && widgetSide === SplitSide.old && widgetLineNumber === oldLine.lineNumber;

  const newLineWidget = newLine.lineNumber && widgetSide === SplitSide.new && widgetLineNumber === newLine.lineNumber;

  const oldWidgetRendered =
    oldLineWidget &&
    renderWidgetLine?.({ diffFile, side: SplitSide.old, lineNumber: oldLine.lineNumber, onClose: () => setWidget({}) });

  const newWidgetRendered =
    newLineWidget &&
    renderWidgetLine?.({ diffFile, side: SplitSide.new, lineNumber: newLine.lineNumber, onClose: () => setWidget({}) });

  if (!renderWidgetLine) return null;

  return (
    <tr data-line={`${lineNumber}-widget`} data-state="widget" className="diff-line diff-line-widget">
      {oldWidgetRendered ? (
        <td className="diff-line-widget-old-content p-0" colSpan={2}>
          <div className="diff-line-widget-wrapper">{oldWidgetRendered}</div>
        </td>
      ) : (
        <td
          className="diff-line-widget-old-placeholder select-none p-0"
          style={{ backgroundColor: `var(${emptyBGName})` }}
          colSpan={2}
        />
      )}
      {newWidgetRendered ? (
        <td
          className="diff-line-widget-new-content border-l-[1px] p-0"
          colSpan={2}
          style={{ borderLeftColor: `var(${borderColorName})`, borderLeftStyle: "solid" }}
        >
          <div className="diff-line-widget-wrapper">{newWidgetRendered}</div>
        </td>
      ) : (
        <td
          className="diff-line-widget-new-placeholder select-none border-l-[1px] p-0"
          style={{
            backgroundColor: `var(${emptyBGName})`,
            borderLeftColor: `var(${borderColorName})`,
            borderLeftStyle: "solid",
          }}
          colSpan={2}
        />
      )}
    </tr>
  );
};

// TODO! improve performance
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

  const currentIsShow = useWidget.useShallowSelector(
    React.useCallback(
      (s) => {
        const widgetLineNumber = s.widgetLineNumber;

        const widgetSide = s.widgetSide;

        const oldLine = diffFile.getSplitLeftLine(index);

        const newLine = diffFile.getSplitRightLine(index);

        const oldLineWidget =
          oldLine.lineNumber && widgetSide === SplitSide.old && widgetLineNumber === oldLine.lineNumber;

        const newLineWidget =
          newLine.lineNumber && widgetSide === SplitSide.new && widgetLineNumber === newLine.lineNumber;

        const currentIsShow = oldLineWidget || newLineWidget;

        return currentIsShow;
      },
      [diffFile, index]
    ),
    (p, c) => p === c
  );

  if (!currentIsShow) return null;

  return <InternalDiffSplitWidgetLine index={index} diffFile={diffFile} lineNumber={lineNumber} />;
};
