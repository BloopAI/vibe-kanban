/* eslint-disable @typescript-eslint/no-unnecessary-type-constraint */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { DiffFile, _cacheMap, SplitSide } from "@git-diff-view/core";
import { diffFontSizeName, DiffModeEnum } from "@git-diff-view/utils";
import { memo, useEffect, useMemo, forwardRef, useImperativeHandle, useRef } from "react";
import * as React from "react";

import { useIsMounted } from "../hooks/useIsMounted";
import { useUnmount } from "../hooks/useUnmount";

import { DiffSplitView } from "./DiffSplitView";
import { DiffUnifiedView } from "./DiffUnifiedView";
import { DiffViewContext } from "./DiffViewContext";
import { createDiffConfigStore } from "./tools";
// import { DiffSplitView } from "./v2/DiffSplitView_v2";

import type { createDiffWidgetStore } from "./tools";
import type { DiffHighlighter, DiffHighlighterLang } from "@git-diff-view/core";
import type { CSSProperties, ForwardedRef, ReactNode, RefObject } from "react";

_cacheMap.name = "@git-diff-view/react";

export { SplitSide, DiffModeEnum };

export type DiffViewProps<T> = {
  data?: {
    oldFile?: { fileName?: string | null; fileLang?: DiffHighlighterLang | string | null; content?: string | null };
    newFile?: { fileName?: string | null; fileLang?: DiffHighlighterLang | string | null; content?: string | null };
    hunks: string[];
  };
  extendData?: { oldFile?: Record<string, { data: T }>; newFile?: Record<string, { data: T }> };
  diffFile?: DiffFile;
  className?: string;
  style?: CSSProperties;
  /**
   * provide a custom highlighter
   * eg: lowlight, refractor, starry-night, shiki
   */
  registerHighlighter?: Omit<DiffHighlighter, "getHighlighterEngine">;
  diffViewMode?: DiffModeEnum;
  diffViewWrap?: boolean;
  diffViewTheme?: "light" | "dark";
  diffViewFontSize?: number;
  diffViewHighlight?: boolean;
  diffViewAddWidget?: boolean;
  renderWidgetLine?: ({
    diffFile,
    side,
    lineNumber,
    onClose,
  }: {
    lineNumber: number;
    side: SplitSide;
    diffFile: DiffFile;
    onClose: () => void;
  }) => ReactNode;
  renderExtendLine?: ({
    diffFile,
    side,
    data,
    lineNumber,
    onUpdate,
  }: {
    lineNumber: number;
    side: SplitSide;
    data: T;
    diffFile: DiffFile;
    onUpdate: () => void;
  }) => ReactNode;
  onAddWidgetClick?: (lineNumber: number, side: SplitSide) => void;
  onCreateUseWidgetHook?: (hook: ReturnType<typeof createDiffWidgetStore>) => void;
};

type DiffViewProps_1<T> = Omit<DiffViewProps<T>, "data"> & {
  data?: {
    oldFile?: { fileName?: string | null; fileLang?: DiffHighlighterLang | null; content?: string | null };
    newFile?: { fileName?: string | null; fileLang?: DiffHighlighterLang | null; content?: string | null };
    hunks: string[];
  };
};

type DiffViewProps_2<T> = Omit<DiffViewProps<T>, "data"> & {
  data?: {
    oldFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
    newFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
    hunks: string[];
  };
};

const InternalDiffView = <T extends unknown>(
  props: Omit<DiffViewProps<T>, "data" | "registerHighlighter"> & {
    isMounted: boolean;
    wrapperRef?: RefObject<HTMLDivElement>;
  }
) => {
  const {
    diffFile,
    className,
    style,
    wrapperRef,
    diffViewMode,
    diffViewWrap,
    diffViewFontSize,
    diffViewHighlight,
    renderWidgetLine,
    renderExtendLine,
    extendData,
    diffViewAddWidget,
    onAddWidgetClick,
    onCreateUseWidgetHook,
    isMounted,
  } = props;

  const diffFileId = useMemo(() => diffFile.getId(), [diffFile]);

  // performance optimization
  const useDiffContext = useMemo(
    () => createDiffConfigStore(props, diffFileId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    const {
      id,
      setId,
      mode,
      setMode,
      mounted,
      setMounted,
      enableAddWidget,
      setEnableAddWidget,
      enableHighlight,
      setEnableHighlight,
      enableWrap,
      setEnableWrap,
      setExtendData,
      fontSize,
      setFontSize,
      onAddWidgetClick: _onAddWidgetClick,
      setOnAddWidgetClick,
      renderExtendLine: _renderExtendLine,
      setRenderExtendLine,
      renderWidgetLine: _renderWidgetLine,
      setRenderWidgetLine,
      onCreateUseWidgetHook: _onCreateUseWidgetHook,
      setOnCreateUseWidgetHook,
    } = useDiffContext.getReadonlyState();

    if (diffFileId && diffFileId !== id) {
      setId(diffFileId);
    }

    if (diffViewMode && diffViewMode !== mode) {
      setMode(diffViewMode);
    }

    if (mounted !== isMounted) {
      setMounted(isMounted);
    }

    if (diffViewAddWidget !== enableAddWidget) {
      setEnableAddWidget(diffViewAddWidget);
    }

    if (diffViewHighlight !== enableHighlight) {
      setEnableHighlight(diffViewHighlight);
    }

    if (diffViewWrap !== enableWrap) {
      setEnableWrap(diffViewWrap);
    }

    if (extendData) {
      setExtendData(extendData);
    }

    if (diffViewFontSize && diffViewFontSize !== fontSize) {
      setFontSize(diffViewFontSize);
    }

    if (onAddWidgetClick !== _onAddWidgetClick.current) {
      setOnAddWidgetClick({ current: onAddWidgetClick });
    }

    if (onCreateUseWidgetHook !== _onCreateUseWidgetHook) {
      setOnCreateUseWidgetHook(onCreateUseWidgetHook);
    }

    if (renderExtendLine !== _renderExtendLine) {
      setRenderExtendLine(renderExtendLine);
    }

    if (renderWidgetLine !== _renderWidgetLine) {
      setRenderWidgetLine(renderWidgetLine);
    }
  }, [
    useDiffContext,
    diffViewFontSize,
    diffViewHighlight,
    diffViewMode,
    diffViewWrap,
    diffViewAddWidget,
    diffFileId,
    isMounted,
    renderWidgetLine,
    renderExtendLine,
    extendData,
    onAddWidgetClick,
    onCreateUseWidgetHook,
  ]);

  const value = useMemo(() => ({ useDiffContext }), [useDiffContext]);

  return (
    <DiffViewContext.Provider value={value}>
      <div
        className="diff-tailwindcss-wrapper"
        data-component="git-diff-view"
        data-theme={diffFile._getTheme() || "light"}
        data-version={__VERSION__}
        data-highlighter={diffFile._getHighlighterName()}
        ref={wrapperRef}
      >
        <div
          className="diff-style-root"
          style={{
            // @ts-ignore
            [diffFontSizeName]: diffViewFontSize + "px",
          }}
        >
          <div
            id={isMounted ? `diff-root${diffFileId}` : undefined}
            className={"diff-view-wrapper" + (className ? ` ${className}` : "")}
            style={style}
          >
            {diffViewMode & DiffModeEnum.Split ? (
              <DiffSplitView diffFile={diffFile} />
            ) : (
              <DiffUnifiedView diffFile={diffFile} />
            )}
          </div>
        </div>
      </div>
    </DiffViewContext.Provider>
  );
};

const MemoedInternalDiffView = memo(InternalDiffView);

const DiffViewWithRef = <T extends unknown>(
  props: DiffViewProps<T>,
  ref: ForwardedRef<{ getDiffFileInstance: () => DiffFile }>
) => {
  const { registerHighlighter, data, diffViewTheme, diffFile: _diffFile, ...restProps } = props;

  const diffFile = useMemo(() => {
    if (_diffFile) {
      // missing data for plain file render
      // TODO next release update ?
      // will cause more complex for diffFile flow control, keep current
      const diffFile = DiffFile.createInstance({});
      diffFile._mergeFullBundle(_diffFile._getFullBundle());
      return diffFile;
    } else if (data) {
      return new DiffFile(
        data?.oldFile?.fileName || "",
        data?.oldFile?.content || "",
        data?.newFile?.fileName || "",
        data?.newFile?.content || "",
        data?.hunks || [],
        data?.oldFile?.fileLang || "",
        data?.newFile?.fileLang || ""
      );
    }
    return null;
  }, [data, _diffFile]);

  const diffFileRef = useRef(diffFile);

  const wrapperRef = useRef<HTMLDivElement>();

  if (diffFileRef.current && diffFileRef.current !== diffFile) {
    diffFileRef.current.clear?.();
    diffFileRef.current = diffFile;
  }

  const isMounted = useIsMounted();

  useEffect(() => {
    if (_diffFile && diffFile) {
      _diffFile._addClonedInstance(diffFile);
      return () => {
        _diffFile._delClonedInstance(diffFile);
      };
    }
  }, [diffFile, _diffFile]);

  useEffect(() => {
    if (!diffFile) return;
    diffFile.initTheme(diffViewTheme);
    diffFile.initRaw();
    diffFile.buildSplitDiffLines();
    diffFile.buildUnifiedDiffLines();
  }, [diffFile, diffViewTheme]);

  useEffect(() => {
    if (!diffFile) return;
    
    if (props.diffViewHighlight) {
      diffFile.initSyntax({ registerHighlighter });
      diffFile.notifyAll();
    }
  }, [diffFile, props.diffViewHighlight, registerHighlighter]);

  useEffect(() => {
    if (!diffFile) return;

    const init = () => {
      wrapperRef.current?.setAttribute("data-theme", diffFile._getTheme() || "light");
      wrapperRef.current?.setAttribute("data-highlighter", diffFile._getHighlighterName());
    };

    init();

    const cb = diffFile.subscribe(init);

    return cb;
  }, [diffFile, diffViewTheme]);

  // fix react strict mode error
  useUnmount(() => (__DEV__ ? diffFile?._destroy?.() : diffFile?.clear?.()), [diffFile]);

  useImperativeHandle(ref, () => ({ getDiffFileInstance: () => diffFile }), [diffFile]);

  if (!diffFile) return null;

  return (
    <MemoedInternalDiffView
      key={diffFile.getId()}
      {...restProps}
      diffFile={diffFile}
      isMounted={isMounted}
      wrapperRef={wrapperRef}
      diffViewTheme={diffViewTheme}
      diffViewMode={restProps.diffViewMode || DiffModeEnum.SplitGitHub}
      diffViewFontSize={restProps.diffViewFontSize || 14}
    />
  );
};

// type helper function
function ReactDiffView<T>(
  props: DiffViewProps_1<T> & { ref?: ForwardedRef<{ getDiffFileInstance: () => DiffFile }> }
): JSX.Element;
function ReactDiffView<T>(
  props: DiffViewProps_2<T> & { ref?: ForwardedRef<{ getDiffFileInstance: () => DiffFile }> }
): JSX.Element;
function ReactDiffView<T>(props: DiffViewProps<T> & { ref?: ForwardedRef<{ getDiffFileInstance: () => DiffFile }> }) {
  return <DiffViewWithRef {...props} />;
}

const InnerDiffView = forwardRef(DiffViewWithRef);

InnerDiffView.displayName = "DiffView";

export const DiffView = InnerDiffView as typeof ReactDiffView;

export const version = __VERSION__;
