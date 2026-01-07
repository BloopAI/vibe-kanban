/* eslint-disable @typescript-eslint/ban-ts-comment */
import { getUnifiedContentLine, SplitSide } from "@git-diff-view/core";
import { diffFontSizeName, removeAllSelection, diffAsideWidthName } from "@git-diff-view/utils";
import * as React from "react";
import { Fragment, memo, useEffect, useMemo, useRef } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim/index.js";

import { useTextWidth } from "../hooks/useTextWidth";

import { DiffUnifiedContentLine } from "./DiffUnifiedContentLine";
import { DiffUnifiedExtendLine } from "./DiffUnifiedExtendLine";
import { DiffUnifiedHunkLine } from "./DiffUnifiedHunkLine";
import { DiffUnifiedWidgetLine } from "./DiffUnifiedWidgetLine";
import { useDiffViewContext } from "./DiffViewContext";
import { DiffWidgetContext } from "./DiffWidgetContext";
import { createDiffWidgetStore } from "./tools";

import type { DiffFile } from "@git-diff-view/core";
import type { MouseEventHandler } from "react";

export const DiffUnifiedView = memo(({ diffFile }: { diffFile: DiffFile }) => {
  const { useDiffContext } = useDiffViewContext();

  const ref = useRef<HTMLStyleElement>(null);

  const tempRef = useRef<SplitSide>();

  const useDiffContextRef = useRef(useDiffContext);

  useDiffContextRef.current = useDiffContext;

  // performance optimization
  const useWidget = useMemo(() => createDiffWidgetStore(useDiffContextRef), []);

  const contextValue = useMemo(() => ({ useWidget }), [useWidget]);

  const { fontSize, enableWrap, enableHighlight, enableAddWidget, onCreateUseWidgetHook } =
    useDiffContext.useShallowStableSelector((s) => ({
      fontSize: s.fontSize,
      enableWrap: s.enableWrap,
      enableHighlight: s.enableHighlight,
      enableAddWidget: s.enableAddWidget,
      onCreateUseWidgetHook: s.onCreateUseWidgetHook,
    }));

  useSyncExternalStore(diffFile.subscribe, diffFile.getUpdateCount, diffFile.getUpdateCount);

  useEffect(() => {
    const { setWidget } = useWidget.getReadonlyState();

    setWidget({});
  }, [diffFile, useWidget]);

  useEffect(() => {
    onCreateUseWidgetHook?.(useWidget);
  }, [useWidget, onCreateUseWidgetHook]);

  const unifiedLineLength = Math.max(diffFile.unifiedLineLength, diffFile.fileLineLength);

  const _width = useTextWidth({
    text: unifiedLineLength.toString(),
    font: useMemo(() => ({ fontSize: fontSize + "px", fontFamily: "Menlo, Consolas, monospace" }), [fontSize]),
  });

  const width = Math.max(40, _width + 10);

  const lines = getUnifiedContentLine(diffFile);

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
      if (state) {
        if (state === "extend" || state === "hunk" || state === "widget") {
          if (tempRef.current !== undefined) {
            tempRef.current = undefined;
            setStyle(undefined);
            removeAllSelection();
          }
          return;
        } else {
          if (tempRef.current !== SplitSide.new) {
            tempRef.current = SplitSide.new;
            setStyle(SplitSide.new);
            removeAllSelection();
          }
          return;
        }
      }

      ele = ele.parentElement;
    }
  };

  return (
    <DiffWidgetContext.Provider value={contextValue}>
      <div className={`unified-diff-view ${enableWrap ? "unified-diff-view-wrap" : "unified-diff-view-normal"} w-full`}>
        <style data-select-style ref={ref} />
        <div
          className="unified-diff-table-wrapper diff-table-scroll-container w-full overflow-x-auto overflow-y-hidden"
          style={{
            // @ts-ignore
            [diffAsideWidthName]: `${Math.round(width)}px`,
            fontFamily: "Menlo, Consolas, monospace",
            fontSize: `var(${diffFontSizeName})`,
          }}
        >
          <table
            className={`unified-diff-table w-full border-collapse border-spacing-0 ${enableWrap ? "table-fixed" : ""}`}
          >
            <colgroup>
              <col className="unified-diff-table-num-col" />
              <col className="unified-diff-table-content-col" />
            </colgroup>
            <thead className="hidden">
              <tr>
                <th scope="col">line number</th>
                <th scope="col">line content</th>
              </tr>
            </thead>
            <tbody className="diff-table-body leading-[1.4]" onMouseDownCapture={onMouseDown}>
              {lines.map((item) => (
                <Fragment key={item.index}>
                  <DiffUnifiedHunkLine index={item.index} lineNumber={item.lineNumber} diffFile={diffFile} />
                  <DiffUnifiedContentLine
                    index={item.index}
                    lineNumber={item.lineNumber}
                    diffFile={diffFile}
                    enableWrap={enableWrap}
                    enableHighlight={enableHighlight}
                    enableAddWidget={enableAddWidget}
                  />
                  <DiffUnifiedWidgetLine index={item.index} lineNumber={item.lineNumber} diffFile={diffFile} />
                  <DiffUnifiedExtendLine index={item.index} lineNumber={item.lineNumber} diffFile={diffFile} />
                </Fragment>
              ))}
              <DiffUnifiedHunkLine
                index={diffFile.unifiedLineLength}
                lineNumber={diffFile.unifiedLineLength}
                diffFile={diffFile}
              />
            </tbody>
          </table>
        </div>
      </div>
    </DiffWidgetContext.Provider>
  );
});

DiffUnifiedView.displayName = "DiffUnifiedView";
