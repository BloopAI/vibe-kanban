/* eslint-disable @typescript-eslint/ban-ts-comment */
import { DiffFileLineType, getSplitLines, type DiffFile } from "@git-diff-view/core";
import {
  removeAllSelection,
  syncScroll,
  diffFontSizeName,
  diffAsideWidthName,
  borderColorName,
} from "@git-diff-view/utils";
import { memo, useEffect, useRef } from "react";
import * as React from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim/index.js";

import { useTextWidth } from "../../hooks/useTextWidth";
import { SplitSide } from "../DiffView";
import { useDiffViewContext } from "../DiffViewContext";

import { DiffSplitViewLine } from "./DiffSplitViewLineNormal_v2";

import type { MouseEventHandler } from "react";

export const DiffSplitViewTable = ({
  side,
  diffFile,
  onMouseDown,
}: {
  side: SplitSide;
  diffFile: DiffFile;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
}) => {
  const className = side === SplitSide.new ? "new-diff-table" : "old-diff-table";

  const lines = getSplitLines(diffFile);

  return (
    <div className={className + " w-max min-w-full"} data-mode={SplitSide[side]}>
      <div className="diff-table-body leading-[1.6]" onMouseDownCapture={onMouseDown}>
        {lines.map((line) => (
          <DiffSplitViewLine
            key={line.index + "-" + DiffFileLineType[line.type]}
            side={side}
            line={line}
            diffFile={diffFile}
          />
        ))}
      </div>
    </div>
  );
};

export const DiffSplitViewNormal = memo(({ diffFile }: { diffFile: DiffFile }) => {
  const ref1 = useRef<HTMLDivElement>(null);

  const ref2 = useRef<HTMLDivElement>(null);

  const ref = useRef<HTMLStyleElement>();

  const splitLineLength = Math.max(diffFile.splitLineLength, diffFile.fileLineLength);

  const { useDiffContext } = useDiffViewContext();

  const fontSize = useDiffContext.useShallowStableSelector((s) => s.fontSize);

  useSyncExternalStore(diffFile.subscribe, diffFile.getUpdateCount, diffFile.getUpdateCount);

  useEffect(() => {
    const left = ref1.current;
    const right = ref2.current;
    if (!left || !right) return;
    return syncScroll(left, right);
  }, []);

  const font = React.useMemo(
    () => ({ fontSize: fontSize + "px", fontFamily: "Menlo, Consolas, monospace" }),
    [fontSize]
  );

  const _width = useTextWidth({
    text: splitLineLength.toString(),
    font,
  });

  const width = Math.max(40, _width + 25);

  const setStyle = (side: SplitSide) => {
    if (!ref.current) return;
    if (!side) {
      ref.current.textContent = "";
    } else {
      const id = `diff-root${diffFile.getId()}`;
      ref.current.textContent = `#${id} [data-state="extend"] {user-select: none} \n#${id} [data-state="hunk"] {user-select: none} \n#${id} [data-state="widget"] {user-select: none}`;
    }
  };

  const onMouseDown: MouseEventHandler<HTMLTableSectionElement> = (e) => {
    let ele = e.target;

    // need remove all the selection
    if (ele && ele instanceof HTMLElement && ele.nodeName === "BUTTON") {
      removeAllSelection();
      return;
    }

    while (ele && ele instanceof HTMLElement) {
      const state = ele.getAttribute("data-state");
      const side = ele.getAttribute("data-side");
      if (side) {
        setStyle(SplitSide[side]);
        removeAllSelection();
      }
      if (state) {
        if (state === "extend" || state === "hunk" || state === "widget") {
          setStyle(undefined);
          removeAllSelection();
          return;
        } else {
          return;
        }
      }

      ele = ele.parentElement;
    }
  };

  return (
    <div className="split-diff-view split-diff-view-normal flex w-full basis-[50%]">
      <style data-select-style ref={ref} />
      <div
        className="old-diff-table-wrapper diff-table-scroll-container w-full overflow-x-auto overflow-y-hidden"
        ref={ref1}
        style={{
          // @ts-ignore
          [diffAsideWidthName]: `${Math.round(width)}px`,
          overscrollBehaviorX: "none",
          fontFamily: "Menlo, Consolas, monospace",
          fontSize: `var(${diffFontSizeName})`,
        }}
      >
        <DiffSplitViewTable side={SplitSide.old} diffFile={diffFile} onMouseDown={onMouseDown} />
      </div>
      <div className="diff-split-line w-[1.5px]" style={{ backgroundColor: `var(${borderColorName})` }} />
      <div
        className="new-diff-table-wrapper diff-table-scroll-container w-full overflow-x-auto overflow-y-hidden"
        ref={ref2}
        style={{
          // @ts-ignore
          [diffAsideWidthName]: `${Math.round(width)}px`,
          overscrollBehaviorX: "none",
          fontFamily: "Menlo, Consolas, monospace",
          fontSize: `var(${diffFontSizeName})`,
        }}
      >
        <DiffSplitViewTable side={SplitSide.new} diffFile={diffFile} onMouseDown={onMouseDown} />
      </div>
    </div>
  );
});

DiffSplitViewNormal.displayName = "DiffSplitViewNormal";
