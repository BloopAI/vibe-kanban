/* eslint-disable @typescript-eslint/ban-ts-comment */
import { type DiffFile, getSplitLines } from "@git-diff-view/core";
import { removeAllSelection, diffFontSizeName, diffAsideWidthName } from "@git-diff-view/utils";
import { memo, useMemo, useRef } from "react";
import * as React from "react";
// SEE https://github.com/facebook/react/pull/25231
import { useSyncExternalStore } from "use-sync-external-store/shim/index.js";

import { useTextWidth } from "../../hooks/useTextWidth";
import { SplitSide } from "../DiffView";
import { useDiffViewContext } from "../DiffViewContext";

import { DiffSplitViewLine } from "./DiffSplitViewLineWrap_v2";

import type { MouseEventHandler } from "react";

export const DiffSplitViewWrap = memo(({ diffFile }: { diffFile: DiffFile }) => {
  const splitLineLength = Math.max(diffFile.splitLineLength, diffFile.fileLineLength);

  const { useDiffContext } = useDiffViewContext();

  const ref = useRef<HTMLStyleElement>(null);

  const fontSize = useDiffContext.useShallowStableSelector((s) => s.fontSize);

  useSyncExternalStore(diffFile.subscribe, diffFile.getUpdateCount, diffFile.getUpdateCount);

  const font = useMemo(() => ({ fontSize: fontSize + "px", fontFamily: "Menlo, Consolas, monospace" }), [fontSize]);

  const _width = useTextWidth({
    text: splitLineLength.toString(),
    font,
  });

  const width = Math.max(40, _width + 25);

  const lines = getSplitLines(diffFile);

  const setStyle = (side: SplitSide) => {
    if (!ref.current) return;
    if (!side) {
      ref.current.textContent = "";
    } else {
      const id = `diff-root${diffFile.getId()}`;
      const targetSide = side === SplitSide.old ? SplitSide.new : SplitSide.old;
      ref.current.textContent = `#${id} [data-side="${SplitSide[targetSide]}"] {user-select: none} \n#${id} [data-state="extend"] {user-select: none} \n#${id} [data-state="hunk"] {user-select: none} \n#${id} [data-state="widget"] {user-select: none}`;
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
    <div className="split-diff-view split-diff-view-warp w-full">
      <div
        className="diff-table-wrapper w-full"
        style={{
          // @ts-ignore
          [diffAsideWidthName]: `${Math.round(width)}px`,
          fontFamily: "Menlo, Consolas, monospace",
          fontSize: `var(${diffFontSizeName})`,
        }}
      >
        <style data-select-style ref={ref} />
        <div className="diff-table w-full table-fixed border-collapse">
          <div className="diff-table-body leading-[1.6]" onMouseDownCapture={onMouseDown}>
            {lines.map((line, index) => (
              <DiffSplitViewLine key={line.index + index} line={line} diffFile={diffFile} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

DiffSplitViewWrap.displayName = "DiffSplitViewWrap";
