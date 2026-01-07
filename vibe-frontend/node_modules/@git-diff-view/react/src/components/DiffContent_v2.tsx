import { DiffLineType, type DiffFile, type DiffLine, type diffChanges, type SyntaxLine } from "@git-diff-view/core";
import {
  addContentHighlightBGName,
  delContentHighlightBGName,
  diffFontSizeName,
  getSymbol,
  NewLineSymbol,
} from "@git-diff-view/utils";
import * as React from "react";

import { getStyleObjectFromString } from "./DiffContent";
import { DiffNoNewLine } from "./DiffNoNewLine";

const RenderRange = ({
  str,
  startIndex,
  endIndex,
  ranges,
  isAdd,
  indexRef,
}: {
  str: string;
  startIndex: number;
  endIndex: number;
  isAdd: boolean;
  ranges: ReturnType<typeof diffChanges>["addRange"]["range"];
  indexRef: { current: number };
}) => {
  if (!str) return null;

  const index = indexRef.current;

  const range = ranges[index];

  if (!range || endIndex < range.location || range.location + range.length < startIndex) return str.replace("\n", "");

  const index1 = range.location - startIndex;
  const index2 = index1 < 0 ? 0 : index1;
  const str1 = str.slice(0, index2);
  const str2 = str.slice(index2, index1 + range.length);
  const str3 = str.slice(index1 + range.length);
  const isStart = str1.length || range.location === startIndex;

  const isEnd = str3.length || endIndex === range.location + range.length - 1;

  if (isEnd && str3.length) indexRef.current++;

  const isLast = str2.includes("\n");

  const _str2 = isLast ? str2.replace("\n", "").replace("\r", "") : str2;

  return (
    <span
      data-range-start={range.location}
      data-range-end={range.location + range.length}
      data-total={ranges.length}
      data-index={index}
    >
      <span data-start={startIndex} data-end={endIndex}>
        {str1}
        <span
          data-diff-highlight
          style={{
            backgroundColor: isAdd ? `var(${addContentHighlightBGName})` : `var(${delContentHighlightBGName})`,
            borderTopLeftRadius: isStart ? "0.2em" : undefined,
            borderBottomLeftRadius: isStart ? "0.2em" : undefined,
            borderTopRightRadius: isEnd || isLast ? "0.2em" : undefined,
            borderBottomRightRadius: isEnd || isLast ? "0.2em" : undefined,
          }}
        >
          {_str2}
        </span>
        {/* 可能会出现一个node跨越多个range的情况 */}
        {RenderRange({
          str: str3,
          startIndex: startIndex + str1.length + str2.length,
          endIndex,
          ranges,
          isAdd,
          indexRef,
        })}
      </span>
    </span>
  );
};

// TODO
const DiffSyntax = ({
  rawLine,
  diffLine,
  operator,
  syntaxLine,
  enableWrap,
}: {
  rawLine: string;
  diffLine?: DiffLine;
  syntaxLine?: SyntaxLine;
  operator?: "add" | "del";
  enableWrap?: boolean;
}) => {
  if (!syntaxLine) {
    return <DiffString rawLine={rawLine} diffLine={diffLine} operator={operator} />;
  }

  const diffRange = diffLine?.diffChanges;

  if (diffRange?.hasLineChange) {
    const isAdd = operator === "add";

    const targetRange = diffRange.range.filter((i) => i.type === (isAdd ? 1 : -1));

    const isNewLineSymbolChanged = diffRange.newLineSymbol;

    const newLineSymbol = getSymbol(isNewLineSymbolChanged);

    const hasNoTrailingNewLine = isNewLineSymbolChanged === NewLineSymbol.NEWLINE;

    const rangeIndexRef = { current: 0 };

    return (
      <span className="diff-line-syntax-raw">
        {syntaxLine.nodeList?.map(({ node, wrapper }, index) => {
          const range = targetRange[rangeIndexRef.current];
          if (!range || node.endIndex < range.location || range.location + range.length < node.startIndex) {
            return (
              <span
                key={index}
                data-start={node.startIndex}
                data-end={node.endIndex}
                className={wrapper?.properties?.className?.join(" ")}
                style={getStyleObjectFromString(wrapper?.properties?.style || "")}
              >
                {node.value.replace("\n", "")}
              </span>
            );
          } else {
            return (
              <span
                key={index}
                data-start={node.startIndex}
                data-end={node.endIndex}
                className={wrapper?.properties?.className?.join(" ")}
                style={getStyleObjectFromString(wrapper?.properties?.style || "")}
              >
                {/* 将组件转换为函数调用，避免同级渲染时后续组件的index没有正确更新的问题 */}
                {RenderRange({
                  str: node.value,
                  startIndex: node.startIndex,
                  endIndex: node.endIndex,
                  ranges: targetRange,
                  isAdd,
                  indexRef: rangeIndexRef,
                })}
              </span>
            );
          }
        })}

        {newLineSymbol && (
          <span
            data-newline-symbol
            data-diff-highlight
            className="rounded-[0.2em]"
            style={{
              backgroundColor: isAdd ? `var(${addContentHighlightBGName})` : `var(${delContentHighlightBGName})`,
            }}
          >
            {newLineSymbol}
          </span>
        )}

        {hasNoTrailingNewLine && (
          <span
            data-no-newline-at-end-of-file-symbol
            className={enableWrap ? "block !text-red-500" : "inline-block align-middle !text-red-500"}
            style={{
              width: `var(${diffFontSizeName})`,
              height: `var(${diffFontSizeName})`,
            }}
          >
            <DiffNoNewLine />
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="diff-line-syntax-raw">
      {syntaxLine?.nodeList?.map(({ node, wrapper }, index) => (
        <span
          key={index}
          data-start={node.startIndex}
          data-end={node.endIndex}
          className={wrapper?.properties?.className?.join(" ")}
          style={getStyleObjectFromString(wrapper?.properties?.style || "")}
        >
          {node.value}
        </span>
      ))}
    </span>
  );
};

// TODO
const DiffString = ({
  rawLine,
  diffLine,
  operator,
  enableWrap,
}: {
  rawLine: string;
  diffLine?: DiffLine;
  operator?: "add" | "del";
  enableWrap?: boolean;
}) => {
  const diffRange = diffLine?.diffChanges;

  const isAdd = operator === "add";

  if (diffRange?.hasLineChange) {
    const targetRange = diffRange.range;

    const isNewLineSymbolChanged = diffRange.newLineSymbol;

    const newLineSymbol = getSymbol(isNewLineSymbolChanged);

    const hasNoTrailingNewLine = isNewLineSymbolChanged === NewLineSymbol.NEWLINE;

    return (
      <span className="diff-line-content-raw">
        {targetRange.map(({ type, str, location, length }, index) => {
          if (type === 0) {
            return <span key={index}>{str}</span>;
          } else {
            return (
              <span key={index} data-range-start={location} data-range-end={location + length}>
                <span
                  data-diff-highlight
                  className="rounded-[0.2em]"
                  style={{
                    backgroundColor: isAdd ? `var(${addContentHighlightBGName})` : `var(${delContentHighlightBGName})`,
                  }}
                >
                  {str}
                </span>
              </span>
            );
          }
        })}

        {newLineSymbol && (
          <span
            data-newline-symbol
            data-diff-highlight
            className="rounded-[0.2em]"
            style={{
              backgroundColor: isAdd ? `var(${addContentHighlightBGName})` : `var(${delContentHighlightBGName})`,
            }}
          >
            {newLineSymbol}
          </span>
        )}

        {hasNoTrailingNewLine && (
          <span
            data-no-newline-at-end-of-file-symbol
            className={enableWrap ? "block !text-red-500" : "inline-block align-middle !text-red-500"}
            style={{
              width: `var(${diffFontSizeName})`,
              height: `var(${diffFontSizeName})`,
            }}
          >
            <DiffNoNewLine />
          </span>
        )}
      </span>
    );
  } else {
    return <span className="diff-line-content-raw">{rawLine}</span>;
  }
};

// TODO
export const DiffContent_v2 = ({
  diffLine,
  rawLine,
  syntaxLine,
  enableWrap,
  enableHighlight,
}: {
  rawLine: string;
  syntaxLine?: SyntaxLine;
  diffLine?: DiffLine;
  diffFile: DiffFile;
  enableWrap: boolean;
  enableHighlight: boolean;
}) => {
  const isAdded = diffLine?.type === DiffLineType.Add;

  const isDelete = diffLine?.type === DiffLineType.Delete;

  const isMaxLineLengthToIgnoreSyntax = syntaxLine?.nodeList?.length > 150;

  return (
    <div
      className="diff-line-content-item pl-[2.0em]"
      // data-val={rawLine}
      style={{
        whiteSpace: enableWrap ? "pre-wrap" : "pre",
        wordBreak: enableWrap ? "break-all" : "initial",
      }}
    >
      <span
        data-operator={isAdded ? "+" : isDelete ? "-" : undefined}
        className="diff-line-content-operator ml-[-1.5em] inline-block w-[1.5em] select-none indent-[0.2em]"
      >
        {isAdded ? "+" : isDelete ? "-" : " "}
      </span>
      {enableHighlight && syntaxLine && !isMaxLineLengthToIgnoreSyntax ? (
        <DiffSyntax
          operator={isAdded ? "add" : isDelete ? "del" : undefined}
          rawLine={rawLine}
          diffLine={diffLine}
          syntaxLine={syntaxLine}
          enableWrap={enableWrap}
        />
      ) : (
        <DiffString
          operator={isAdded ? "add" : isDelete ? "del" : undefined}
          rawLine={rawLine}
          diffLine={diffLine}
          enableWrap={enableWrap}
        />
      )}
    </div>
  );
};
