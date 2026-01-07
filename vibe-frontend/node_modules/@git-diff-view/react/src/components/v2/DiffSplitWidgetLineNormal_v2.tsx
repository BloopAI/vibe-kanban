import { emptyBGName } from "@git-diff-view/utils";
import * as React from "react";

import { useDomWidth } from "../../hooks/useDomWidth";
import { useSyncHeight } from "../../hooks/useSyncHeight";
import { SplitSide } from "../DiffView";
import { useDiffViewContext } from "../DiffViewContext";
import { useDiffWidgetContext } from "../DiffWidgetContext";

import type { DiffFile } from "@git-diff-view/core";

const InternalDiffSplitWidgetLine = ({
  index,
  side,
  diffFile,
  lineNumber,
}: {
  index: number;
  side: SplitSide;
  diffFile: DiffFile;
  lineNumber: number;
}) => {
  const { useWidget } = useDiffWidgetContext();

  const { useDiffContext } = useDiffViewContext();

  const oldLine = diffFile.getSplitLeftLine(index);

  const newLine = diffFile.getSplitRightLine(index);

  const widgetSide = useWidget.getReadonlyState().widgetSide;

  const widgetLineNumber = useWidget.getReadonlyState().widgetLineNumber;

  const setWidget = useWidget.getReadonlyState().setWidget;

  const oldLineWidget = oldLine.lineNumber && widgetSide === SplitSide.old && widgetLineNumber === oldLine.lineNumber;

  const newLineWidget = newLine.lineNumber && widgetSide === SplitSide.new && widgetLineNumber === newLine.lineNumber;

  const currentLine = side === SplitSide.old ? oldLine : newLine;

  const otherSide = side === SplitSide.old ? SplitSide.new : SplitSide.old;

  const currentHasWidget = side === SplitSide.old ? oldLineWidget : newLineWidget;

  const hasWidget = oldLineWidget || newLineWidget;

  const renderWidgetLine = useDiffContext.useShallowStableSelector((s) => s.renderWidgetLine);

  useSyncHeight({
    wrapper: `div[data-state="widget"][data-line="${lineNumber}-widget"]`,
    selector: `div[data-line="${lineNumber}-widget-content"]`,
    side: SplitSide[currentHasWidget ? side : otherSide],
    enable: hasWidget && typeof renderWidgetLine === "function",
  });

  const width = useDomWidth({
    selector: side === SplitSide.old ? ".old-diff-table-wrapper" : ".new-diff-table-wrapper",
    enable: !!currentHasWidget && typeof renderWidgetLine === "function",
  });

  if (!renderWidgetLine) return null;

  return (
    <div
      data-line={`${lineNumber}-widget`}
      data-state="widget"
      data-side={SplitSide[side]}
      className="diff-line diff-line-widget"
    >
      {currentHasWidget ? (
        <div className={`diff-line-widget-${SplitSide[side]}-content p-0`}>
          <div
            data-line={`${lineNumber}-widget-content`}
            data-side={SplitSide[side]}
            className="diff-line-widget-wrapper sticky left-0 z-[1]"
            style={{ width }}
          >
            {width > 0 &&
              renderWidgetLine?.({
                diffFile,
                side,
                lineNumber: currentLine.lineNumber,
                onClose: () => setWidget({}),
              })}
          </div>
        </div>
      ) : (
        <div
          className={`diff-line-widget-${SplitSide[side]}-placeholder h-full select-none p-0`}
          style={{ backgroundColor: `var(${emptyBGName})` }}
        >
          <div data-line={`${lineNumber}-widget-content`} data-side={SplitSide[side]} />
        </div>
      )}
    </div>
  );
};

export const DiffSplitWidgetLine = ({
  index,
  diffFile,
  side,
  lineNumber,
}: {
  index: number;
  side: SplitSide;
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

  return <InternalDiffSplitWidgetLine index={index} diffFile={diffFile} side={side} lineNumber={lineNumber} />;
};
