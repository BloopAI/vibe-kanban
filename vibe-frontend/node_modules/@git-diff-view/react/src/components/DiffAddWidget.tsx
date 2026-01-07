import { addWidgetBGName, addWidgetColorName, diffFontSizeName } from "@git-diff-view/utils";
import * as React from "react";

import type { SplitSide } from "./DiffView";
import type { DiffFile } from "@git-diff-view/core";

export const DiffSplitAddWidget = ({
  side,
  className,
  lineNumber,
  onWidgetClick,
  onOpenAddWidget,
}: {
  index: number;
  lineNumber: number;
  diffFile: DiffFile;
  side: SplitSide;
  className?: string;
  onWidgetClick?: (lineNumber: number, side: SplitSide) => void;
  onOpenAddWidget: (lineNumber: number, side: SplitSide) => void;
}) => {
  return (
    <div
      className={
        "diff-add-widget-wrapper invisible select-none transition-transform hover:scale-110 group-hover:visible" +
        (className ? " " + className : "")
      }
      style={{
        width: `calc(var(${diffFontSizeName}) * 1.4)`,
        height: `calc(var(${diffFontSizeName}) * 1.4)`,
      }}
    >
      <button
        className="diff-add-widget z-[1] flex h-full w-full origin-center cursor-pointer items-center justify-center rounded-md text-[1.2em]"
        style={{
          color: `var(${addWidgetColorName})`,
          backgroundColor: `var(${addWidgetBGName})`,
        }}
        onClick={() => {
          onOpenAddWidget(lineNumber, side);
          onWidgetClick?.(lineNumber, side);
        }}
      >
        +
      </button>
    </div>
  );
};

export const DiffUnifiedAddWidget = ({
  lineNumber,
  side,
  onWidgetClick,
  onOpenAddWidget,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
  side: SplitSide;
  onWidgetClick?: (lineNumber: number, side: SplitSide) => void;
  onOpenAddWidget: (lineNumber: number, side: SplitSide) => void;
}) => {
  return (
    <div
      className="diff-add-widget-wrapper invisible absolute left-[100%] top-[1px] translate-x-[-50%] select-none transition-transform hover:scale-110 group-hover:visible"
      style={{
        width: `calc(var(${diffFontSizeName}) * 1.4)`,
        height: `calc(var(${diffFontSizeName}) * 1.4)`,
      }}
    >
      <button
        className="diff-add-widget z-[1] flex h-full w-full origin-center cursor-pointer items-center justify-center rounded-md text-[1.2em]"
        style={{
          color: `var(${addWidgetColorName})`,
          backgroundColor: `var(${addWidgetBGName})`,
        }}
        onClick={() => {
          onOpenAddWidget(lineNumber, side);
          onWidgetClick?.(lineNumber, side);
        }}
      >
        +
      </button>
    </div>
  );
};
