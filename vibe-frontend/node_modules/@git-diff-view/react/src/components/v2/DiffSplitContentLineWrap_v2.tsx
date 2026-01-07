import { DiffLineType, type DiffFile, checkDiffLineIncludeChange } from "@git-diff-view/core";
import {
  getContentBG,
  getLineNumberBG,
  plainLineNumberColorName,
  emptyBGName,
  borderColorName,
  diffAsideWidthName,
  expandLineNumberColorName,
} from "@git-diff-view/utils";
import * as React from "react";

import { DiffSplitAddWidget } from "../DiffAddWidget";
import { DiffContent } from "../DiffContent";
import { SplitSide } from "../DiffView";
import { useDiffViewContext } from "../DiffViewContext";
import { useDiffWidgetContext } from "../DiffWidgetContext";

const InternalDiffSplitLine = ({
  index,
  diffFile,
  lineNumber,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
}) => {
  const oldLine = diffFile.getSplitLeftLine(index);

  const newLine = diffFile.getSplitRightLine(index);

  const oldSyntaxLine = diffFile.getOldSyntaxLine(oldLine?.lineNumber);

  const newSyntaxLine = diffFile.getNewSyntaxLine(newLine?.lineNumber);

  const oldPlainLine = diffFile.getOldPlainLine(oldLine.lineNumber);

  const newPlainLine = diffFile.getNewPlainLine(newLine.lineNumber);

  const hasDiff = !!oldLine?.diff || !!newLine?.diff;

  const hasChange = checkDiffLineIncludeChange(oldLine?.diff) || checkDiffLineIncludeChange(newLine?.diff);

  const oldLineIsDelete = oldLine?.diff?.type === DiffLineType.Delete;

  const newLineIsAdded = newLine?.diff?.type === DiffLineType.Add;

  const { useDiffContext } = useDiffViewContext();

  const { enableHighlight, enableAddWidget, onAddWidgetClick } = useDiffContext.useShallowStableSelector((s) => ({
    enableHighlight: s.enableHighlight,
    enableAddWidget: s.enableAddWidget,
    onAddWidgetClick: s.onAddWidgetClick,
  }));

  const { useWidget } = useDiffWidgetContext();

  const setWidget = useWidget.getReadonlyState().setWidget;

  const hasOldLine = !!oldLine.lineNumber;

  const hasNewLine = !!newLine.lineNumber;

  const oldLineContentBG = getContentBG(false, oldLineIsDelete, hasDiff);

  const oldLineNumberBG = getLineNumberBG(false, oldLineIsDelete, hasDiff);

  const newLineContentBG = getContentBG(newLineIsAdded, false, hasDiff);

  const newLineNumberBG = getLineNumberBG(newLineIsAdded, false, hasDiff);

  return (
    <div data-line={lineNumber} data-state={hasDiff ? "diff" : "plain"} className="diff-line flex">
      {hasOldLine ? (
        <>
          <div
            className="diff-line-old-num group relative flex w-[1%] min-w-[40px] select-none items-start px-[10px] text-right"
            data-side={SplitSide[SplitSide.old]}
            style={{
              backgroundColor: oldLineNumberBG,
              color: `var(${hasDiff ? plainLineNumberColorName : expandLineNumberColorName})`,
              width: `var(${diffAsideWidthName})`,
              minWidth: `var(${diffAsideWidthName})`,
              maxWidth: `var(${diffAsideWidthName})`,
            }}
          >
            {hasDiff && enableAddWidget && (
              <DiffSplitAddWidget
                index={index}
                lineNumber={oldLine.lineNumber}
                side={SplitSide.old}
                diffFile={diffFile}
                onWidgetClick={(...props) => onAddWidgetClick.current?.(...props)}
                className="absolute left-[100%] z-[1] translate-x-[-50%]"
                onOpenAddWidget={(lineNumber, side) => setWidget({ lineNumber: lineNumber, side: side })}
              />
            )}
            <span
              className="w-full"
              data-line-num={oldLine.lineNumber}
              style={{ opacity: hasChange ? undefined : 0.5 }}
            >
              {oldLine.lineNumber}
            </span>
          </div>
          <div
            className="diff-line-old-content group relative flex w-[50%] items-center pr-[10px]"
            data-side={SplitSide[SplitSide.old]}
            style={{ backgroundColor: oldLineContentBG }}
          >
            {hasDiff && enableAddWidget && (
              <DiffSplitAddWidget
                index={index}
                lineNumber={oldLine.lineNumber}
                side={SplitSide.old}
                diffFile={diffFile}
                onWidgetClick={(...props) => onAddWidgetClick.current?.(...props)}
                className="absolute right-[100%] top-0 z-[1] translate-x-[50%]"
                onOpenAddWidget={(lineNumber, side) => setWidget({ lineNumber: lineNumber, side: side })}
              />
            )}
            <DiffContent
              enableWrap={true}
              diffFile={diffFile}
              rawLine={oldLine.value}
              diffLine={oldLine.diff}
              plainLine={oldPlainLine}
              syntaxLine={oldSyntaxLine}
              enableHighlight={enableHighlight}
            />
          </div>
        </>
      ) : (
        <>
          <div
            className="diff-line-old-num-placeholder w-[1%] min-w-[40px] select-none px-[10px]"
            data-side={SplitSide[SplitSide.old]}
            style={{
              backgroundColor: `var(${emptyBGName})`,
              width: `var(${diffAsideWidthName})`,
              minWidth: `var(${diffAsideWidthName})`,
              maxWidth: `var(${diffAsideWidthName})`,
            }}
          >
            &ensp;
          </div>
          <div
            className="diff-line-old-placeholder w-[50%] select-none pr-[10px]"
            data-side={SplitSide[SplitSide.old]}
            style={{ backgroundColor: `var(${emptyBGName})` }}
          >
            &ensp;
          </div>
        </>
      )}
      <div className="diff-split-line w-[1px] flex-shrink-0" style={{ backgroundColor: `var(${borderColorName})` }} />
      {hasNewLine ? (
        <>
          <div
            className="diff-line-new-num group relative flex w-[1%] min-w-[40px] select-none items-start px-[10px] text-right"
            data-side={SplitSide[SplitSide.new]}
            style={{
              backgroundColor: newLineNumberBG,
              color: `var(${hasDiff ? plainLineNumberColorName : expandLineNumberColorName})`,
              width: `var(${diffAsideWidthName})`,
              minWidth: `var(${diffAsideWidthName})`,
              maxWidth: `var(${diffAsideWidthName})`,
            }}
          >
            {hasDiff && enableAddWidget && (
              <DiffSplitAddWidget
                index={index}
                lineNumber={newLine.lineNumber}
                side={SplitSide.new}
                diffFile={diffFile}
                onWidgetClick={(...props) => onAddWidgetClick.current?.(...props)}
                className="absolute left-[100%] z-[1] translate-x-[-50%]"
                onOpenAddWidget={(lineNumber, side) => setWidget({ lineNumber: lineNumber, side: side })}
              />
            )}
            <span
              className="w-full"
              data-line-num={newLine.lineNumber}
              style={{ opacity: hasChange ? undefined : 0.5 }}
            >
              {newLine.lineNumber}
            </span>
          </div>
          <div
            className="diff-line-new-content group relative flex w-[50%] items-center pr-[10px]"
            data-side={SplitSide[SplitSide.new]}
            style={{ backgroundColor: newLineContentBG }}
          >
            {hasDiff && enableAddWidget && (
              <DiffSplitAddWidget
                index={index}
                lineNumber={newLine.lineNumber}
                side={SplitSide.new}
                diffFile={diffFile}
                onWidgetClick={(...props) => onAddWidgetClick.current?.(...props)}
                className="absolute right-[100%] top-0 z-[1] translate-x-[50%]"
                onOpenAddWidget={(lineNumber, side) => setWidget({ lineNumber: lineNumber, side: side })}
              />
            )}
            <DiffContent
              enableWrap={true}
              diffFile={diffFile}
              rawLine={newLine.value || ""}
              diffLine={newLine.diff}
              plainLine={newPlainLine}
              syntaxLine={newSyntaxLine}
              enableHighlight={enableHighlight}
            />
          </div>
        </>
      ) : (
        <>
          <div
            className="diff-line-new-num-placeholder w-[1%] min-w-[40px] select-none px-[10px]"
            data-side={SplitSide[SplitSide.new]}
            style={{
              backgroundColor: `var(${emptyBGName})`,
              width: `var(${diffAsideWidthName})`,
              minWidth: `var(${diffAsideWidthName})`,
              maxWidth: `var(${diffAsideWidthName})`,
            }}
          >
            &ensp;
          </div>
          <div
            className="diff-line-new-placeholder w-[50%] select-none pr-[10px]"
            data-side={SplitSide[SplitSide.new]}
            style={{ backgroundColor: `var(${emptyBGName})` }}
          >
            &ensp;
          </div>
        </>
      )}
    </div>
  );
};

export const DiffSplitContentLine = ({
  index,
  diffFile,
  lineNumber,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
}) => {
  const oldLine = diffFile.getSplitLeftLine(index);

  const newLine = diffFile.getSplitRightLine(index);

  if (oldLine?.isHidden && newLine?.isHidden) return null;

  return <InternalDiffSplitLine index={index} diffFile={diffFile} lineNumber={lineNumber} />;
};
