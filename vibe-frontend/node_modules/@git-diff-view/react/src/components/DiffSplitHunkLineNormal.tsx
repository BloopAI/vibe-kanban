import { composeLen, type DiffFile } from "@git-diff-view/core";
import {
  hunkLineNumberBGName,
  plainLineNumberColorName,
  diffAsideWidthName,
  hunkContentBGName,
  hunkContentColorName,
} from "@git-diff-view/utils";
import * as React from "react";

import { DiffModeEnum, SplitSide } from "..";
import { useSyncHeight } from "../hooks/useSyncHeight";

import { ExpandAll, ExpandDown, ExpandUp } from "./DiffExpand";
import { useDiffViewContext } from "./DiffViewContext";

const InternalDiffSplitHunkLineGitHub = ({
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
  const currentHunk = diffFile.getSplitHunkLine(index);

  const expandEnabled = diffFile.getExpandEnabled();

  useSyncHeight({
    selector: `tr[data-line="${lineNumber}-hunk"]`,
    side: SplitSide[SplitSide.old],
    enable: side === SplitSide.new,
  });

  const enableHunkAction = side === SplitSide.old;

  const couldExpand = expandEnabled && currentHunk && currentHunk.splitInfo;

  const isExpandAll =
    currentHunk &&
    currentHunk.splitInfo &&
    currentHunk.splitInfo.endHiddenIndex - currentHunk.splitInfo.startHiddenIndex < composeLen;

  const isFirstLine = currentHunk && currentHunk.isFirst;

  const isLastLine = currentHunk && currentHunk.isLast;

  return (
    <tr
      data-line={`${lineNumber}-hunk`}
      data-state="hunk"
      data-side={SplitSide[side]}
      className="diff-line diff-line-hunk"
    >
      {enableHunkAction ? (
        <>
          <td
            className="diff-line-hunk-action sticky left-0 w-[1%] min-w-[40px] select-none p-[1px]"
            style={{
              backgroundColor: `var(${hunkLineNumberBGName})`,
              color: `var(${plainLineNumberColorName})`,
              width: `var(${diffAsideWidthName})`,
              minWidth: `var(${diffAsideWidthName})`,
              maxWidth: `var(${diffAsideWidthName})`,
            }}
          >
            {couldExpand ? (
              isFirstLine ? (
                <button
                  className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
                  title="Expand Up"
                  data-title="Expand Up"
                  onClick={() => diffFile.onSplitHunkExpand("up", index)}
                >
                  <ExpandUp className="fill-current" />
                </button>
              ) : isLastLine ? (
                <button
                  className="diff-widget-tooltip relative flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
                  title="Expand Down"
                  data-title="Expand Down"
                  onClick={() => diffFile.onSplitHunkExpand("down", index)}
                >
                  <ExpandDown className="fill-current" />
                </button>
              ) : isExpandAll ? (
                <button
                  className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
                  title="Expand All"
                  data-title="Expand All"
                  onClick={() => diffFile.onSplitHunkExpand("all", index)}
                >
                  <ExpandAll className="fill-current" />
                </button>
              ) : (
                <>
                  <button
                    className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[2px]"
                    title="Expand Down"
                    data-title="Expand Down"
                    onClick={() => diffFile.onSplitHunkExpand("down", index)}
                  >
                    <ExpandDown className="fill-current" />
                  </button>
                  <button
                    className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[2px]"
                    title="Expand Up"
                    data-title="Expand Up"
                    onClick={() => diffFile.onSplitHunkExpand("up", index)}
                  >
                    <ExpandUp className="fill-current" />
                  </button>
                </>
              )
            ) : (
              <div className="min-h-[28px]">&ensp;</div>
            )}
          </td>
          <td
            className="diff-line-hunk-content pr-[10px] align-middle"
            style={{ backgroundColor: `var(${hunkContentBGName})` }}
          >
            <div
              className="pl-[1.5em]"
              style={{
                color: `var(${hunkContentColorName})`,
              }}
            >
              {currentHunk.splitInfo?.plainText || currentHunk.text}
            </div>
          </td>
        </>
      ) : (
        <td
          className="diff-line-hunk-placeholder select-none"
          colSpan={2}
          style={{ backgroundColor: `var(${hunkContentBGName})` }}
        >
          <div className="min-h-[28px]">&ensp;</div>
        </td>
      )}
    </tr>
  );
};

const InternalDiffSplitHunkLineGitLab = ({
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
  const currentHunk = diffFile.getSplitHunkLine(index);

  const expandEnabled = diffFile.getExpandEnabled();

  useSyncHeight({
    selector: `tr[data-line="${lineNumber}-hunk"]`,
    side: SplitSide[side],
    enable: true,
  });

  const couldExpand = expandEnabled && currentHunk && currentHunk.splitInfo;

  const isExpandAll =
    currentHunk &&
    currentHunk.splitInfo &&
    currentHunk.splitInfo.endHiddenIndex - currentHunk.splitInfo.startHiddenIndex < composeLen;

  const isFirstLine = currentHunk && currentHunk.isFirst;

  const isLastLine = currentHunk && currentHunk.isLast;

  return (
    <tr
      data-line={`${lineNumber}-hunk`}
      data-state="hunk"
      data-side={SplitSide[side]}
      className="diff-line diff-line-hunk"
    >
      <td
        className="diff-line-hunk-action sticky left-0 w-[1%] min-w-[40px] select-none p-[1px]"
        style={{
          backgroundColor: `var(${hunkLineNumberBGName})`,
          color: `var(${plainLineNumberColorName})`,
          width: `var(${diffAsideWidthName})`,
          minWidth: `var(${diffAsideWidthName})`,
          maxWidth: `var(${diffAsideWidthName})`,
        }}
      >
        {couldExpand ? (
          isFirstLine ? (
            <button
              className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
              title="Expand Up"
              data-title="Expand Up"
              onClick={() => diffFile.onSplitHunkExpand("up", index)}
            >
              <ExpandUp className="fill-current" />
            </button>
          ) : isLastLine ? (
            <button
              className="diff-widget-tooltip relative flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
              title="Expand Down"
              data-title="Expand Down"
              onClick={() => diffFile.onSplitHunkExpand("down", index)}
            >
              <ExpandDown className="fill-current" />
            </button>
          ) : isExpandAll ? (
            <button
              className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
              title="Expand All"
              data-title="Expand All"
              onClick={() => diffFile.onSplitHunkExpand("all", index)}
            >
              <ExpandAll className="fill-current" />
            </button>
          ) : (
            <>
              <button
                className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[2px]"
                title="Expand Down"
                data-title="Expand Down"
                onClick={() => diffFile.onSplitHunkExpand("down", index)}
              >
                <ExpandDown className="fill-current" />
              </button>
              <button
                className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[2px]"
                title="Expand Up"
                data-title="Expand Up"
                onClick={() => diffFile.onSplitHunkExpand("up", index)}
              >
                <ExpandUp className="fill-current" />
              </button>
            </>
          )
        ) : (
          <div className="min-h-[28px]">&ensp;</div>
        )}
      </td>
      <td
        className="diff-line-hunk-content pr-[10px] align-middle"
        style={{ backgroundColor: `var(${hunkContentBGName})` }}
      >
        <div
          className="pl-[1.5em]"
          style={{
            color: `var(${hunkContentColorName})`,
          }}
        >
          {currentHunk.splitInfo?.plainText || currentHunk.text}
        </div>
      </td>
    </tr>
  );
};

const InternalDiffSplitHunkLine = ({
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
  const { useDiffContext } = useDiffViewContext();

  const diffViewMode = useDiffContext.useShallowStableSelector((s) => s.mode);

  if (
    diffViewMode === DiffModeEnum.SplitGitHub ||
    diffViewMode === DiffModeEnum.Split ||
    diffViewMode === DiffModeEnum.Unified
  ) {
    return <InternalDiffSplitHunkLineGitHub index={index} diffFile={diffFile} side={side} lineNumber={lineNumber} />;
  } else {
    return <InternalDiffSplitHunkLineGitLab index={index} diffFile={diffFile} side={side} lineNumber={lineNumber} />;
  }
};

export const DiffSplitHunkLine = ({
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
  const currentHunk = diffFile.getSplitHunkLine(index);

  const currentIsShow =
    currentHunk &&
    currentHunk.splitInfo &&
    currentHunk.splitInfo.startHiddenIndex < currentHunk.splitInfo.endHiddenIndex;

  const currentIsPureHunk = currentHunk && diffFile._getIsPureDiffRender() && !currentHunk.splitInfo;

  if (!currentIsShow && !currentIsPureHunk) return null;

  return <InternalDiffSplitHunkLine index={index} diffFile={diffFile} side={side} lineNumber={lineNumber} />;
};
