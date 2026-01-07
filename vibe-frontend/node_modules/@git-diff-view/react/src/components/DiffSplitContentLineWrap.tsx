import { DiffLineType, type DiffFile, checkDiffLineIncludeChange } from "@git-diff-view/core";
import {
  getContentBG,
  getLineNumberBG,
  plainLineNumberColorName,
  emptyBGName,
  borderColorName,
  expandLineNumberColorName,
} from "@git-diff-view/utils";
import * as React from "react";

import { SplitSide } from "..";

import { DiffSplitAddWidget } from "./DiffAddWidget";
import { DiffContent } from "./DiffContent";
// import { DiffContent_v2 } from "./DiffContent_v2";
import { useDiffViewContext } from "./DiffViewContext";
import { useDiffWidgetContext } from "./DiffWidgetContext";

const InternalDiffSplitLine = ({
  index,
  diffFile,
  lineNumber,
  enableAddWidget,
  enableHighlight,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
  enableHighlight: boolean;
  enableAddWidget: boolean;
}) => {
  const oldLine = diffFile.getSplitLeftLine(index);

  const newLine = diffFile.getSplitRightLine(index);

  const oldSyntaxLine = diffFile.getOldSyntaxLine(oldLine?.lineNumber);

  const oldPlainLine = diffFile.getOldPlainLine(oldLine.lineNumber);

  const newSyntaxLine = diffFile.getNewSyntaxLine(newLine?.lineNumber);

  const newPlainLine = diffFile.getNewPlainLine(newLine.lineNumber);

  const hasDiff = !!oldLine?.diff || !!newLine?.diff;

  const hasChange = checkDiffLineIncludeChange(oldLine?.diff) || checkDiffLineIncludeChange(newLine?.diff);

  const oldLineIsDelete = oldLine?.diff?.type === DiffLineType.Delete;

  const newLineIsAdded = newLine?.diff?.type === DiffLineType.Add;

  const { useDiffContext } = useDiffViewContext();

  const onAddWidgetClick = useDiffContext.getReadonlyState().onAddWidgetClick;

  const { useWidget } = useDiffWidgetContext();

  const setWidget = useWidget.getReadonlyState().setWidget;

  const hasOldLine = !!oldLine.lineNumber;

  const hasNewLine = !!newLine.lineNumber;

  const oldLineContentBG = getContentBG(false, oldLineIsDelete, hasDiff);

  const oldLineNumberBG = getLineNumberBG(false, oldLineIsDelete, hasDiff);

  const newLineContentBG = getContentBG(newLineIsAdded, false, hasDiff);

  const newLineNumberBG = getLineNumberBG(newLineIsAdded, false, hasDiff);

  return (
    <tr data-line={lineNumber} data-state={hasDiff ? "diff" : "plain"} className="diff-line">
      {hasOldLine ? (
        <>
          <td
            className="diff-line-old-num group relative w-[1%] min-w-[40px] select-none pl-[10px] pr-[10px] text-right align-top"
            data-side={SplitSide[SplitSide.old]}
            style={{ backgroundColor: oldLineNumberBG, color: `var(${plainLineNumberColorName})` }}
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
            <span data-line-num={oldLine.lineNumber} style={{ opacity: hasChange ? undefined : 0.5 }}>
              {oldLine.lineNumber}
            </span>
          </td>
          <td
            className="diff-line-old-content group relative pr-[10px] align-top"
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
                className="absolute right-[100%] z-[1] translate-x-[50%]"
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
          </td>
        </>
      ) : (
        <td
          className="diff-line-old-placeholder select-none"
          data-side={SplitSide[SplitSide.old]}
          style={{ backgroundColor: `var(${emptyBGName})` }}
          colSpan={2}
        >
          <span>&ensp;</span>
        </td>
      )}
      {hasNewLine ? (
        <>
          <td
            className="diff-line-new-num group relative w-[1%] min-w-[40px] select-none border-l-[1px] pl-[10px] pr-[10px] text-right align-top"
            data-side={SplitSide[SplitSide.new]}
            style={{
              backgroundColor: newLineNumberBG,
              color: `var(${hasDiff ? plainLineNumberColorName : expandLineNumberColorName})`,
              borderLeftColor: `var(${borderColorName})`,
              borderLeftStyle: "solid",
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
            <span data-line-num={newLine.lineNumber} style={{ opacity: hasChange ? undefined : 0.5 }}>
              {newLine.lineNumber}
            </span>
          </td>
          <td
            className="diff-line-new-content group relative pr-[10px] align-top"
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
                className="absolute right-[100%] z-[1] translate-x-[50%]"
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
          </td>
        </>
      ) : (
        <td
          className="diff-line-new-placeholder select-none border-l-[1px]"
          style={{
            backgroundColor: `var(${emptyBGName})`,
            borderLeftColor: `var(${borderColorName})`,
            borderLeftStyle: "solid",
          }}
          data-side={SplitSide[SplitSide.new]}
          colSpan={2}
        >
          <span>&ensp;</span>
        </td>
      )}
    </tr>
  );
};

export const DiffSplitContentLine = ({
  index,
  diffFile,
  lineNumber,
  enableAddWidget,
  enableHighlight,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
  enableHighlight: boolean;
  enableAddWidget: boolean;
}) => {
  const oldLine = diffFile.getSplitLeftLine(index);

  const newLine = diffFile.getSplitRightLine(index);

  if (oldLine?.isHidden && newLine?.isHidden) return null;

  return (
    <InternalDiffSplitLine
      index={index}
      diffFile={diffFile}
      lineNumber={lineNumber}
      enableAddWidget={enableAddWidget}
      enableHighlight={enableHighlight}
    />
  );
};
