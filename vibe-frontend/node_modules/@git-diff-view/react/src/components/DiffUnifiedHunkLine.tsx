import { composeLen } from "@git-diff-view/core";
import {
  diffAsideWidthName,
  hunkContentBGName,
  hunkContentColorName,
  hunkLineNumberBGName,
  plainLineNumberColorName,
} from "@git-diff-view/utils";
import * as React from "react";

import { ExpandAll, ExpandDown, ExpandUp } from "./DiffExpand";
import { useDiffViewContext } from "./DiffViewContext";

import type { DiffFile } from "@git-diff-view/core";

const InternalDiffUnifiedHunkLine = ({
  index,
  diffFile,
  lineNumber,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
}) => {
  const currentHunk = diffFile.getUnifiedHunkLine(index);

  const expandEnabled = diffFile.getExpandEnabled();

  const { useDiffContext } = useDiffViewContext();

  const enableWrap = useDiffContext.useShallowStableSelector((s) => s.enableWrap);

  const couldExpand = expandEnabled && currentHunk && currentHunk.unifiedInfo;

  const isExpandAll =
    currentHunk &&
    currentHunk.unifiedInfo &&
    currentHunk.unifiedInfo.endHiddenIndex - currentHunk.unifiedInfo.startHiddenIndex < composeLen;

  const isFirstLine = currentHunk && currentHunk.isFirst;

  const isLastLine = currentHunk && currentHunk.isLast;

  return (
    <tr data-line={`${lineNumber}-hunk`} data-state="hunk" className="diff-line diff-line-hunk">
      <td
        className="diff-line-hunk-action sticky left-0 w-[1%] min-w-[100px] select-none p-[1px]"
        style={{
          backgroundColor: `var(${hunkLineNumberBGName})`,
          color: `var(${plainLineNumberColorName})`,
          width: `calc(calc(var(${diffAsideWidthName}) + 5px) * 2)`,
          maxWidth: `calc(calc(var(${diffAsideWidthName}) + 5px) * 2)`,
          minWidth: `calc(calc(var(${diffAsideWidthName}) + 5px) * 2)`,
        }}
      >
        {couldExpand ? (
          isFirstLine ? (
            <button
              className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
              title="Expand Up"
              data-title="Expand Up"
              onClick={() => diffFile.onUnifiedHunkExpand("up", index)}
            >
              <ExpandUp className="fill-current" />
            </button>
          ) : isLastLine ? (
            <button
              className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
              title="Expand Down"
              data-title="Expand Down"
              onClick={() => diffFile.onUnifiedHunkExpand("down", index)}
            >
              <ExpandDown className="fill-current" />
            </button>
          ) : isExpandAll ? (
            <button
              className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[6px]"
              title="Expand All"
              data-title="Expand All"
              onClick={() => diffFile.onUnifiedHunkExpand("all", index)}
            >
              <ExpandAll className="fill-current" />
            </button>
          ) : (
            <>
              <button
                className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[2px]"
                title="Expand Down"
                data-title="Expand Down"
                onClick={() => diffFile.onUnifiedHunkExpand("down", index)}
              >
                <ExpandDown className="fill-current" />
              </button>
              <button
                className="diff-widget-tooltip flex w-full cursor-pointer items-center justify-center rounded-[2px] py-[2px]"
                title="Expand Up"
                data-title="Expand Up"
                onClick={() => diffFile.onUnifiedHunkExpand("up", index)}
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
            whiteSpace: enableWrap ? "pre-wrap" : "pre",
            wordBreak: enableWrap ? "break-all" : "initial",
            color: `var(${hunkContentColorName})`,
          }}
        >
          {currentHunk.unifiedInfo?.plainText || currentHunk.text}
        </div>
      </td>
    </tr>
  );
};

export const DiffUnifiedHunkLine = ({
  index,
  diffFile,
  lineNumber,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
}) => {
  const currentHunk = diffFile.getUnifiedHunkLine(index);

  const currentIsShow =
    currentHunk &&
    currentHunk.unifiedInfo &&
    currentHunk.unifiedInfo.startHiddenIndex < currentHunk.unifiedInfo.endHiddenIndex;

  const currentIsPureHunk = currentHunk && diffFile._getIsPureDiffRender() && !currentHunk.unifiedInfo;

  if (!currentIsShow && !currentIsPureHunk) return null;

  return <InternalDiffUnifiedHunkLine index={index} diffFile={diffFile} lineNumber={lineNumber} />;
};
