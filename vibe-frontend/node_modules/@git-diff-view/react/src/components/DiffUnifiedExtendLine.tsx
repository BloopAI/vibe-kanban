import * as React from "react";
import { useCallback } from "react";

import { SplitSide } from "..";
import { useDomWidth } from "../hooks/useDomWidth";

import { useDiffViewContext } from "./DiffViewContext";

import type { DiffFile } from "@git-diff-view/core";

const InternalDiffUnifiedExtendLine = ({
  index,
  diffFile,
  lineNumber,
  oldLineExtend,
  newLineExtend,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
  oldLineExtend: { data: any };
  newLineExtend: { data: any };
}) => {
  const { useDiffContext } = useDiffViewContext();

  const renderExtendLine = useDiffContext.useShallowStableSelector((s) => s.renderExtendLine);

  const unifiedItem = diffFile.getUnifiedLine(index);

  const width = useDomWidth({
    selector: ".unified-diff-table-wrapper",
    enable: typeof renderExtendLine === "function",
  });

  if (!renderExtendLine) return null;

  return (
    <tr data-line={`${lineNumber}-extend`} data-state="extend" className="diff-line diff-line-extend">
      <td className="diff-line-extend-content p-0 align-top" colSpan={2}>
        <div className="diff-line-extend-wrapper sticky left-0 z-[1]" style={{ width }}>
          {width > 0 &&
            oldLineExtend?.data !== undefined &&
            oldLineExtend?.data !== null &&
            renderExtendLine?.({
              diffFile,
              side: SplitSide.old,
              lineNumber: unifiedItem.oldLineNumber,
              data: oldLineExtend.data,
              onUpdate: diffFile.notifyAll,
            })}
          {width > 0 &&
            newLineExtend?.data !== undefined &&
            newLineExtend?.data !== null &&
            renderExtendLine?.({
              diffFile,
              side: SplitSide.new,
              lineNumber: unifiedItem.newLineNumber,
              data: newLineExtend.data,
              onUpdate: diffFile.notifyAll,
            })}
        </div>
      </td>
    </tr>
  );
};

export const DiffUnifiedExtendLine = ({
  index,
  diffFile,
  lineNumber,
}: {
  index: number;
  diffFile: DiffFile;
  lineNumber: number;
}) => {
  const { useDiffContext } = useDiffViewContext();

  const unifiedItem = diffFile.getUnifiedLine(index);

  const { oldLineExtend, newLineExtend } = useDiffContext(
    useCallback(
      (s) => ({
        oldLineExtend: s.extendData?.oldFile?.[unifiedItem?.oldLineNumber],
        newLineExtend: s.extendData?.newFile?.[unifiedItem?.newLineNumber],
      }),
      [unifiedItem.oldLineNumber, unifiedItem.newLineNumber]
    )
  );

  const hasExtend = oldLineExtend?.data || newLineExtend?.data;

  if (!hasExtend || !unifiedItem || unifiedItem.isHidden) return null;

  return (
    <InternalDiffUnifiedExtendLine
      index={index}
      diffFile={diffFile}
      lineNumber={lineNumber}
      oldLineExtend={oldLineExtend}
      newLineExtend={newLineExtend}
    />
  );
};
