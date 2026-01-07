import * as React from "react";

import { SplitSide } from "..";
import { useDomWidth } from "../hooks/useDomWidth";

import { useDiffViewContext } from "./DiffViewContext";
import { useDiffWidgetContext } from "./DiffWidgetContext";

import type { DiffFile } from "@git-diff-view/core";

const InternalDiffUnifiedWidgetLine = ({
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

  const unifiedItem = diffFile.getUnifiedLine(index);

  const onClose = () => setWidget({});

  const widgetSide = useWidget.getReadonlyState().widgetSide;

  const widgetLineNumber = useWidget.getReadonlyState().widgetLineNumber;

  const oldWidget =
    unifiedItem.oldLineNumber && widgetSide === SplitSide.old && widgetLineNumber === unifiedItem.oldLineNumber;

  const newWidget =
    unifiedItem.newLineNumber && widgetSide === SplitSide.new && widgetLineNumber === unifiedItem.newLineNumber;

  const { useDiffContext } = useDiffViewContext();

  // 需要显示的时候才进行方法订阅，可以大幅度提高性能
  const renderWidgetLine = useDiffContext.useShallowStableSelector((s) => s.renderWidgetLine);

  const width = useDomWidth({
    selector: ".unified-diff-table-wrapper",
    enable: typeof renderWidgetLine === "function",
  });

  if (!renderWidgetLine) return null;

  return (
    <tr data-line={`${lineNumber}-widget`} data-state="widget" className="diff-line diff-line-widget">
      <td className="diff-line-widget-content p-0" colSpan={2}>
        <div className="diff-line-widget-wrapper sticky left-0 z-[1]" style={{ width }}>
          {width > 0 &&
            oldWidget &&
            renderWidgetLine?.({ diffFile, side: SplitSide.old, lineNumber: unifiedItem.oldLineNumber, onClose })}
          {width > 0 &&
            newWidget &&
            renderWidgetLine?.({ diffFile, side: SplitSide.new, lineNumber: unifiedItem.newLineNumber, onClose })}
        </div>
      </td>
    </tr>
  );
};

export const DiffUnifiedWidgetLine = ({
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

        const unifiedItem = diffFile.getUnifiedLine(index);

        const oldWidget =
          unifiedItem.oldLineNumber && widgetSide === SplitSide.old && widgetLineNumber === unifiedItem.oldLineNumber;

        const newWidget =
          unifiedItem.newLineNumber && widgetSide === SplitSide.new && widgetLineNumber === unifiedItem.newLineNumber;

        const currentIsShow = oldWidget || newWidget;

        return currentIsShow;
      },
      [diffFile, index]
    ),
    (p, c) => p === c
  );

  if (!currentIsShow) return null;

  return <InternalDiffUnifiedWidgetLine index={index} diffFile={diffFile} lineNumber={lineNumber} />;
};
