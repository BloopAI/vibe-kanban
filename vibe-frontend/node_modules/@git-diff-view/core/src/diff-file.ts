/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable max-lines */
import { getFile, File } from "./file";
import { DiffLine, DiffLineType, parseInstance, getDiffRange, getLang } from "./parse";

import { SplitSide } from ".";

import type { IRawDiff } from "./parse";
import type { DiffHighlighter, DiffHighlighterLang } from "@git-diff-view/lowlight";

export let composeLen = 40;

export const getCurrentComposeLength = () => composeLen;

export const changeDefaultComposeLength = (compose: number) => {
  composeLen = compose;
};

export const resetDefaultComposeLength = () => {
  composeLen = 40;
};

const idSet = new Set<string>();

export interface SplitLineItem {
  lineNumber?: number;
  value?: string;
  diff?: DiffLineItem;
  isHidden?: boolean;
  _isHidden?: boolean;
}

export interface UnifiedLineItem {
  oldLineNumber?: number;
  newLineNumber?: number;
  value?: string;
  diff?: DiffLineItem;
  isHidden?: boolean;
  _isHidden?: boolean;
}

type HunkInfo = {
  oldStartIndex: number;
  newStartIndex: number;
  oldLength: number;
  newLength: number;
  _oldStartIndex: number;
  _newStartIndex: number;
  _oldLength: number;
  _newLength: number;
};

type HunkLineInfo = {
  startHiddenIndex: number;
  endHiddenIndex: number;
  plainText: string;
  _startHiddenIndex: number;
  _endHiddenIndex: number;
  _plainText: string;
};

export interface DiffLineItem extends DiffLine {
  index: number;
  prevHunkLine?: DiffHunkItem;
}

export interface DiffHunkItem extends DiffLineItem {
  isFirst: boolean;
  isLast: boolean;
  hunkInfo: HunkInfo;
  splitInfo?: HunkLineInfo & HunkInfo;
  unifiedInfo?: HunkLineInfo & HunkInfo;
}

type FileData_1 = {
  oldFile?: { fileName?: string | null; fileLang?: DiffHighlighterLang | null; content?: string | null };
  newFile?: { fileName?: string | null; fileLang?: DiffHighlighterLang | null; content?: string | null };
  hunks?: string[];
};

type FileData_2 = {
  oldFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
  newFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
  hunks?: string[];
};

type FileData_3 = {
  oldFile?: { fileName?: string | null; fileLang?: DiffHighlighterLang | string | null; content?: string | null };
  newFile?: { fileName?: string | null; fileLang?: DiffHighlighterLang | string | null; content?: string | null };
  hunks?: string[];
};

export class DiffFile {
  #oldFileResult?: File;

  #newFileResult?: File;

  #diffListResults?: IRawDiff[];

  #diffLines?: DiffLineItem[];

  #oldFileDiffLines?: Record<string, DiffLineItem>;

  #newFileDiffLines?: Record<string, DiffLineItem>;

  #oldFileLines?: File["rawFile"];

  #newFileLines?: File["rawFile"];

  #oldFilePlainLines?: File["plainFile"];

  #newFilePlainLines?: File["plainFile"];

  #oldFileSyntaxLines?: File["syntaxFile"];

  #newFileSyntaxLines?: File["syntaxFile"];

  #oldFilePlaceholderLines?: Record<string, boolean>;

  #newFilePlaceholderLines?: Record<string, boolean>;

  #splitLeftLines: SplitLineItem[] = [];

  #splitRightLines: SplitLineItem[] = [];

  #splitHunksLines?: Record<string, DiffHunkItem>;

  #unifiedLines: UnifiedLineItem[] = [];

  #unifiedHunksLines?: Record<string, DiffHunkItem>;

  #listeners: ((() => void) & { isSyncExternal?: boolean })[] = [];

  #hasInitRaw: boolean = false;

  #hasInitSyntax: boolean = false;

  #hasBuildSplit: boolean = false;

  #hasBuildUnified: boolean = false;

  #updateCount: number = 0;

  #composeByDiff: boolean = false;

  #composeByMerge: boolean = false;

  #enableTemplate: boolean = true;

  #composeByFullMerge: boolean = false;

  #highlighterName?: string;

  #highlighterType?: string;

  #theme: "light" | "dark" = "light";

  #_theme?: "light" | "dark";

  #hasExpandSplitAll = { state: false };

  #hasExpandUnifiedAll = { state: false };

  _version_ = __VERSION__;

  _oldFileName: string = "";

  _oldFileContent: string = "";

  _oldFileLang: DiffHighlighterLang | string = "";

  _newFileName: string = "";

  _newFileContent: string = "";

  _newFileLang: DiffHighlighterLang | string = "";

  _diffList: string[] = [];

  diffLineLength: number = 0;

  splitLineLength: number = 0;

  unifiedLineLength: number = 0;

  fileLineLength: number = 0;

  additionLength: number = 0;

  deletionLength: number = 0;

  hasSomeLineCollapsed: boolean = false;

  #id: string = "";

  #clonedInstance = new Map<DiffFile, () => void>();

  static createInstance(
    data: FileData_1,
    bundle?: ReturnType<DiffFile["getBundle"] | DiffFile["_getFullBundle"]>
  ): DiffFile;
  static createInstance(
    data: FileData_2,
    bundle?: ReturnType<DiffFile["getBundle"] | DiffFile["_getFullBundle"]>
  ): DiffFile;
  static createInstance(data: FileData_3, bundle?: ReturnType<DiffFile["getBundle"] | DiffFile["_getFullBundle"]>) {
    const instance = new DiffFile(
      data?.oldFile?.fileName || "",
      data?.oldFile?.content || "",
      data?.newFile?.fileName || "",
      data?.newFile?.content || "",
      data?.hunks || [],
      data?.oldFile?.fileLang || "",
      data?.newFile?.fileLang || ""
    );
    if (bundle) {
      if (bundle.isFullMerge) {
        instance._mergeFullBundle(bundle as ReturnType<DiffFile["_getFullBundle"]>);
      } else {
        instance.mergeBundle(bundle);
      }
    }

    return instance;
  }

  constructor(
    _oldFileName: string,
    _oldFileContent: string,
    _newFileName: string,
    _newFileContent: string,
    _diffList: string[],
    _oldFileLang?: DiffHighlighterLang,
    _newFileLang?: DiffHighlighterLang,
    uuid?: string
  );
  constructor(
    _oldFileName: string,
    _oldFileContent: string,
    _newFileName: string,
    _newFileContent: string,
    _diffList: string[],
    _oldFileLang?: string,
    _newFileLang?: string,
    uuid?: string
  );
  constructor(
    _oldFileName: string,
    _oldFileContent: string,
    _newFileName: string,
    _newFileContent: string,
    _diffList: string[],
    _oldFileLang?: DiffHighlighterLang | string,
    _newFileLang?: DiffHighlighterLang | string,
    readonly uuid?: string
  ) {
    Object.defineProperty(this, "__v_skip", { value: true });

    const diffList = Array.from(new Set(_diffList));

    this._oldFileName = _oldFileName;

    this._newFileName = _newFileName;

    this._diffList = diffList;

    this._oldFileLang = getLang(_oldFileLang || _oldFileName || _newFileLang || _newFileName) || "txt";

    this._newFileLang = getLang(_newFileLang || _newFileName || _oldFileLang || _oldFileName) || "txt";

    this._oldFileContent = _oldFileContent;

    this._newFileContent = _newFileContent;

    this.initId();
  }

  #doDiff() {
    if (!this._diffList) return;

    this.#diffListResults = this._diffList.map((s) => parseInstance.parse(s));
  }

  #doFile() {
    if (!this._oldFileContent && !this._newFileContent) return;

    if (this._oldFileContent) {
      this.#oldFileResult = getFile(
        this._oldFileContent,
        this._oldFileLang,
        this.#theme,
        this._oldFileName,
        this.uuid ? this.uuid + "-old" : undefined
      );
      this.#oldFileResult.enableTemplate = this.#enableTemplate;
    }

    if (this._newFileContent) {
      this.#newFileResult = getFile(
        this._newFileContent,
        this._newFileLang,
        this.#theme,
        this._newFileName,
        this.uuid ? this.uuid + "-new" : undefined
      );
      this.#newFileResult.enableTemplate = this.#enableTemplate;
    }
  }

  #composeRaw() {
    this.#oldFileResult?.doRaw();

    this.#oldFileLines = this.#oldFileResult?.rawFile;

    this.#oldFilePlainLines = this.#oldFileResult?.plainFile;

    this.#newFileResult?.doRaw();

    this.#newFileLines = this.#newFileResult?.rawFile;

    this.#newFilePlainLines = this.#newFileResult?.plainFile;

    this.fileLineLength = Math.max(
      this.fileLineLength,
      this.#oldFileResult?.maxLineNumber || 0,
      this.#newFileResult?.maxLineNumber || 0
    );
  }

  #composeFile() {
    if (this._oldFileContent && this._newFileContent) return;

    const oldFilePlaceholderLines: Record<string, boolean> = {};

    const newFilePlaceholderLines: Record<string, boolean> = {};

    // all of the file content not exist, try to use diff result to compose
    if (!this._oldFileContent && !this._newFileContent) {
      let newLineNumber = 1;
      let oldLineNumber = 1;
      let oldFileContent = "";
      let newFileContent = "";
      let hasSymbolChanged = false;
      while (oldLineNumber <= this.diffLineLength || newLineNumber <= this.diffLineLength) {
        const oldIndex = oldLineNumber++;
        const newIndex = newLineNumber++;
        const oldDiffLine = this.#getOldDiffLine(oldIndex);
        const newDiffLine = this.#getNewDiffLine(newIndex);
        if (oldDiffLine) {
          oldFileContent += oldDiffLine.text;
        } else {
          // empty line for placeholder
          oldFileContent += "\n";
          oldFilePlaceholderLines[oldIndex] = true;
        }
        if (newDiffLine) {
          newFileContent += newDiffLine.text;
        } else {
          // empty line for placeholder
          newFileContent += "\n";
          newFilePlaceholderLines[newIndex] = true;
        }
        if (!hasSymbolChanged && oldDiffLine && newDiffLine) {
          hasSymbolChanged = hasSymbolChanged || oldDiffLine.noTrailingNewLine !== newDiffLine.noTrailingNewLine;
        }
      }
      if (!hasSymbolChanged && oldFileContent === newFileContent) return;
      this._oldFileContent = oldFileContent;
      this._newFileContent = newFileContent;
      this.#oldFileResult = getFile(
        this._oldFileContent,
        this._oldFileLang,
        this.#theme,
        this._oldFileName,
        this.uuid ? this.uuid + "-old" : undefined
      );
      this.#oldFileResult.enableTemplate = this.#enableTemplate;
      this.#newFileResult = getFile(
        this._newFileContent,
        this._newFileLang,
        this.#theme,
        this._newFileName,
        this.uuid ? this.uuid + "-new" : undefined
      );
      this.#newFileResult.enableTemplate = this.#enableTemplate;
      this.#oldFilePlaceholderLines = oldFilePlaceholderLines;
      this.#newFilePlaceholderLines = newFilePlaceholderLines;
      // all of the file just compose by diff, so we can not do the expand action
      this.#composeByDiff = true;
    } else if (this.#oldFileResult) {
      let newLineNumber = 1;
      let oldLineNumber = 1;
      let newFileContent = "";
      let hasSymbolChanged = false;
      while (oldLineNumber <= this.#oldFileResult.maxLineNumber) {
        const newDiffLine = this.#getNewDiffLine(newLineNumber++);
        const oldDiffLine = this.#getOldDiffLine(oldLineNumber);
        if (newDiffLine) {
          newFileContent += newDiffLine.text;
          oldLineNumber = newDiffLine.oldLineNumber ? newDiffLine.oldLineNumber + 1 : oldLineNumber;
        } else {
          if (!oldDiffLine) {
            newFileContent += this.#getOldRawLine(oldLineNumber);
          }
          oldLineNumber++;
        }
        if (!hasSymbolChanged && newDiffLine && oldDiffLine) {
          hasSymbolChanged = hasSymbolChanged || newDiffLine.noTrailingNewLine !== oldDiffLine.noTrailingNewLine;
        }
      }
      if (!hasSymbolChanged && newFileContent === this._oldFileContent) return;
      this._newFileContent = newFileContent;
      this.#newFileResult = getFile(
        this._newFileContent,
        this._newFileLang,
        this.#theme,
        this._newFileName,
        this.uuid ? this.uuid + "-new" : undefined
      );
      this.#newFileResult.enableTemplate = this.#enableTemplate;
    } else if (this.#newFileResult) {
      let oldLineNumber = 1;
      let newLineNumber = 1;
      let oldFileContent = "";
      let hasSymbolChanged = false;
      while (newLineNumber <= this.#newFileResult.maxLineNumber) {
        const oldDiffLine = this.#getOldDiffLine(oldLineNumber++);
        const newDiffLine = this.#getNewDiffLine(newLineNumber);
        if (oldDiffLine) {
          oldFileContent += oldDiffLine.text;
          newLineNumber = oldDiffLine.newLineNumber ? oldDiffLine.newLineNumber + 1 : newLineNumber;
        } else {
          if (!newDiffLine) {
            oldFileContent += this.#getNewRawLine(newLineNumber);
          }
          newLineNumber++;
        }
        if (!hasSymbolChanged && newDiffLine && oldDiffLine) {
          hasSymbolChanged = hasSymbolChanged || newDiffLine.noTrailingNewLine !== oldDiffLine.noTrailingNewLine;
        }
      }
      if (!hasSymbolChanged && oldFileContent === this._newFileContent) return;
      this._oldFileContent = oldFileContent;
      this.#oldFileResult = getFile(
        this._oldFileContent,
        this._oldFileLang,
        this.#theme,
        this._oldFileName,
        this.uuid ? this.uuid + "-old" : undefined
      );
      this.#oldFileResult.enableTemplate = this.#enableTemplate;
    }

    this.#composeRaw();
  }

  #composeDiff() {
    if (!this.#diffListResults?.length) return;

    const getAdditionRaw = (lineNumber: number) => {
      return this.#getNewRawLine(lineNumber);
    };

    const getDeletionRaw = (lineNumber: number) => {
      return this.#getOldRawLine(lineNumber);
    };

    const getAdditionSyntax = (lineNumber: number) => {
      return this.#getNewSyntaxLine(lineNumber);
    };

    const getDeletionSyntax = (lineNumber: number) => {
      return this.#getOldSyntaxLine(lineNumber);
    };

    this.#diffLines = [];

    this.additionLength = 0;

    this.deletionLength = 0;

    const tmp: DiffLine[] = [];

    this.#diffListResults.forEach((item) => {
      const hunks = item.hunks;
      hunks.forEach((hunk) => {
        let additions: DiffLine[] = [];
        let deletions: DiffLine[] = [];
        hunk.lines.forEach((line) => {
          if (line.type === DiffLineType.Add) {
            additions.push(line);
            this.additionLength++;
          } else if (line.type === DiffLineType.Delete) {
            deletions.push(line);
            this.deletionLength++;
          } else {
            getDiffRange(additions, deletions, {
              getAdditionRaw,
              getDeletionRaw,
              getAdditionSyntax,
              getDeletionSyntax,
            });
            additions = [];
            deletions = [];
          }
          tmp.push(line);
        });
        getDiffRange(additions, deletions, { getAdditionRaw, getDeletionRaw, getAdditionSyntax, getDeletionSyntax });
      });
    });

    let prevHunkLine: DiffHunkItem | null = null;

    this.#diffLines = tmp.map<DiffLineItem>((i, index) => {
      const typedI = i as DiffHunkItem;

      typedI.index = index;

      typedI.isFirst = index === 0;

      if (typedI.type === DiffLineType.Hunk) {
        const numInfo = typedI.text.split("@@")?.[1].split(" ").filter(Boolean);
        const oldNumInfo = numInfo?.[0] || "";
        const newNumInfo = numInfo?.[1] || "";
        const [oldNumStartIndex, oldNumLength] = oldNumInfo.split(",");
        const [newNumStartIndex, newNumLength] = newNumInfo.split(",");
        typedI.hunkInfo = {
          oldStartIndex: -Number(oldNumStartIndex),
          oldLength: Number(oldNumLength),
          newStartIndex: +Number(newNumStartIndex),
          newLength: Number(newNumLength),

          _oldStartIndex: -Number(oldNumStartIndex),
          _oldLength: Number(oldNumLength),
          _newStartIndex: +Number(newNumStartIndex),
          _newLength: Number(newNumLength),
        };

        if (
          __DEV__ &&
          typedI.isFirst &&
          typedI.hunkInfo.oldStartIndex &&
          typedI.hunkInfo.newStartIndex &&
          typedI.hunkInfo.oldStartIndex !== typedI.hunkInfo.newStartIndex
        ) {
          console.warn("the first hunk should start with the same line number");
        }

        prevHunkLine = typedI;
      } else if (typedI.type === DiffLineType.Context) {
        const typedItem = i as DiffLineItem;
        if (prevHunkLine) {
          typedItem.prevHunkLine = prevHunkLine;
          prevHunkLine = null;
        }
      } else {
        prevHunkLine = null;
      }
      return typedI;
    });

    this.#oldFileDiffLines = {};

    this.#newFileDiffLines = {};

    let maxOldLineNumber = -1;

    let maxNewLineNumber = -1;

    this.#diffLines.forEach((item) => {
      if (item.oldLineNumber) {
        this.diffLineLength = Math.max(this.diffLineLength, item.oldLineNumber);

        this.#oldFileDiffLines[item.oldLineNumber] = item;

        if (__DEV__) {
          if (item.oldLineNumber <= maxOldLineNumber) {
            console.warn(
              'the "lineNumber" from "diff" should be in ascending order, maybe current "diff" string is not a valid "diff" string'
            );
          }

          maxOldLineNumber = Math.max(maxOldLineNumber, item.oldLineNumber);
        }
      }

      if (item.newLineNumber) {
        this.diffLineLength = Math.max(this.diffLineLength, item.newLineNumber);

        this.#newFileDiffLines[item.newLineNumber] = item;

        if (__DEV__) {
          if (item.newLineNumber <= maxNewLineNumber) {
            console.warn(
              'the "lineNumber" from "diff" should be in ascending order, maybe current "diff" string is not a valid "diff" string'
            );
          }

          maxNewLineNumber = Math.max(maxNewLineNumber, item.newLineNumber);
        }
      }
    });
  }

  #composeSyntax({ registerHighlighter }: { registerHighlighter?: Omit<DiffHighlighter, "getHighlighterEngine"> }) {
    this.#oldFileResult?.doSyntax({ registerHighlighter, theme: this.#theme });

    this.#oldFileSyntaxLines = this.#oldFileResult?.syntaxFile;

    this.#newFileResult?.doSyntax({ registerHighlighter, theme: this.#theme });

    this.#newFileSyntaxLines = this.#newFileResult?.syntaxFile;
  }

  #doSyntax({ registerHighlighter }: { registerHighlighter?: Omit<DiffHighlighter, "getHighlighterEngine"> } = {}) {
    if (this.#highlighterType === "class") return;

    if (this.#composeByMerge && !this.#composeByFullMerge) {
      if (__DEV__) {
        console.error(
          `this instance can not do syntax because of the data missing, try to use '_getFullBundle' & '_mergeFullBundle' instead of 'getBundle' & 'mergeBundle'`
        );
      }

      return;
    }

    this.#composeSyntax({ registerHighlighter });

    this.#highlighterName =
      this.#oldFileResult?.highlighterName || this.#newFileResult?.highlighterName || this.#highlighterName;

    this.#highlighterType =
      this.#oldFileResult?.highlighterType || this.#newFileResult?.highlighterType || this.#highlighterType;
  }

  #getOldDiffLine(lineNumber: number | null) {
    if (!lineNumber) return;
    return this.#oldFileDiffLines?.[lineNumber];
  }

  #getNewDiffLine(lineNumber: number | null) {
    if (!lineNumber) return;
    return this.#newFileDiffLines?.[lineNumber];
  }

  #getOldRawLine(lineNumber: number) {
    return this.#oldFileLines?.[lineNumber];
  }

  #getNewRawLine(lineNumber: number) {
    return this.#newFileLines?.[lineNumber];
  }

  #getOldSyntaxLine(lineNumber: number) {
    return this.#oldFileSyntaxLines?.[lineNumber];
  }

  #getNewSyntaxLine(lineNumber: number) {
    return this.#newFileSyntaxLines?.[lineNumber];
  }

  initId() {
    let id = "--" + Math.random().toString().slice(2);

    while (idSet.has(id)) {
      id = "--" + Math.random().toString().slice(2);
    }

    idSet.add(id);

    this.#id = id;
  }

  getId() {
    return this.#id;
  }

  clearId() {
    idSet.delete(this.#id);
  }

  initTheme(theme?: "light" | "dark") {
    this.#_theme = this.#theme;
    this.#theme = theme || this.#theme || "light";
  }

  initRaw() {
    if (this.#hasInitRaw) return;
    this.#doFile();
    this.#composeRaw();
    this.#doDiff();
    this.#composeDiff();
    this.#composeFile();
    this.#hasInitRaw = true;
  }

  initSyntax({ registerHighlighter }: { registerHighlighter?: Omit<DiffHighlighter, "getHighlighterEngine"> } = {}) {
    if (this.#hasInitSyntax && (!this.#_theme || this.#theme === this.#_theme)) return;

    this.#doSyntax({ registerHighlighter });

    this.#composeDiff();

    this.#hasInitSyntax = true;
  }

  init() {
    this.initRaw();
    this.initSyntax();
  }

  enableTemplate() {
    this.#enableTemplate = true;
  }

  disableTemplate() {
    this.#enableTemplate = false;
  }

  getIsEnableTemplate() {
    return this.#enableTemplate;
  }

  buildSplitDiffLines() {
    if (this.#hasBuildSplit) return;
    let oldFileLineNumber = 1;
    let newFileLineNumber = 1;
    let prevIsHidden = true;
    let hideStart = Infinity;
    const maxOldFileLineNumber = this.#oldFileResult?.maxLineNumber || 0;
    const maxNewFileLineNumber = this.#newFileResult?.maxLineNumber || 0;

    if (__DEV__ && !this.#oldFileResult && !this.#newFileResult && this.#composeByMerge) {
      console.error(
        "this instance can not `buildSplitDiffLines` because of the data missing, try to use '_getFullBundle' & '_mergeFullBundle' instead of 'getBundle' & 'mergeBundle'"
      );
    }

    while (oldFileLineNumber <= maxOldFileLineNumber || newFileLineNumber <= maxNewFileLineNumber) {
      const oldDiffLine = this.#getOldDiffLine(oldFileLineNumber);
      const newDiffLine = this.#getNewDiffLine(newFileLineNumber);
      const oldRawLine = this.#getOldRawLine(oldFileLineNumber);
      const newRawLine = this.#getNewRawLine(newFileLineNumber);
      const oldLineHasChange = DiffLine.prototype.isIncludeableLine.call(oldDiffLine || {});
      const newLineHasChange = DiffLine.prototype.isIncludeableLine.call(newDiffLine || {});
      const len = this.#splitRightLines.length;
      const isHidden = !oldDiffLine && !newDiffLine;

      if (oldDiffLine && !newDiffLine) {
        if (oldDiffLine.newLineNumber && oldDiffLine.newLineNumber > newFileLineNumber) {
          newFileLineNumber++;
          continue;
        }
        if (oldDiffLine.newLineNumber === null || oldDiffLine.newLineNumber === undefined) {
          newFileLineNumber++;
        }
      }

      if (newDiffLine && !oldDiffLine) {
        if (newDiffLine.oldLineNumber && newDiffLine.oldLineNumber > oldFileLineNumber) {
          oldFileLineNumber++;
          continue;
        }
        if (newDiffLine.oldLineNumber === null || newDiffLine.oldLineNumber === undefined) {
          oldFileLineNumber++;
        }
      }

      if (!oldDiffLine && !oldRawLine && !newDiffLine && !newRawLine) break;

      if (!oldDiffLine && !newDiffLine) {
        if (this.#oldFilePlaceholderLines?.[oldFileLineNumber] && this.#newFilePlaceholderLines?.[newFileLineNumber]) {
          oldFileLineNumber++;
          newFileLineNumber++;
          continue;
        }
        if (!oldRawLine && this.#newFilePlaceholderLines?.[newFileLineNumber]) {
          newFileLineNumber++;
          continue;
        }
        if (!newRawLine && this.#oldFilePlaceholderLines?.[oldFileLineNumber]) {
          oldFileLineNumber++;
          continue;
        }
      }

      if ((oldLineHasChange && newLineHasChange) || (!oldLineHasChange && !newLineHasChange)) {
        this.#splitLeftLines.push({
          lineNumber: oldFileLineNumber++,
          value: oldRawLine,
          diff: oldDiffLine,
          isHidden,
          _isHidden: isHidden,
        });
        this.#splitRightLines.push({
          lineNumber: newFileLineNumber++,
          value: newRawLine,
          diff: newDiffLine,
          isHidden,
          _isHidden: isHidden,
        });
      } else if (oldLineHasChange) {
        this.#splitLeftLines.push({
          lineNumber: oldFileLineNumber++,
          value: oldRawLine,
          diff: oldDiffLine,
          isHidden,
          _isHidden: isHidden,
        });
        this.#splitRightLines.push({});
      } else if (newLineHasChange) {
        this.#splitLeftLines.push({});
        this.#splitRightLines.push({
          lineNumber: newFileLineNumber++,
          value: newRawLine,
          diff: newDiffLine,
          isHidden,
          _isHidden: isHidden,
        });
      }

      if (!prevIsHidden && isHidden) {
        hideStart = len;
      }

      if (isHidden) {
        this.hasSomeLineCollapsed = true;
      }

      prevIsHidden = isHidden;

      if (oldDiffLine?.prevHunkLine || newDiffLine?.prevHunkLine) {
        const prevHunkLine = oldDiffLine?.prevHunkLine || newDiffLine.prevHunkLine;
        if (prevHunkLine.isFirst) {
          if (__DEV__ && Number.isFinite(hideStart)) {
            console.warn("the first hunk can not have a previous diff line");
          }
          prevHunkLine.splitInfo = {
            ...prevHunkLine.hunkInfo,

            startHiddenIndex: 0,
            endHiddenIndex: prevHunkLine.hunkInfo.newStartIndex - 1,
            plainText: prevHunkLine.text,

            _startHiddenIndex: 0,
            _endHiddenIndex: prevHunkLine.hunkInfo.newStartIndex - 1,
            _plainText: prevHunkLine.text,
          };
          hideStart = Infinity;
        } else if (Number.isFinite(hideStart)) {
          prevHunkLine.splitInfo = {
            ...prevHunkLine.hunkInfo,

            startHiddenIndex: hideStart,
            endHiddenIndex: len,
            plainText: prevHunkLine.text,

            _startHiddenIndex: hideStart,
            _endHiddenIndex: len,
            _plainText: prevHunkLine.text,
          };
          hideStart = Infinity;
        }
        this.#splitHunksLines = {
          ...this.#splitHunksLines,
          [len]: prevHunkLine,
        };
      }
    }

    // have last hunk
    if (Number.isFinite(hideStart)) {
      const lastDiff = new DiffLine("", DiffLineType.Hunk, null, null, null);
      const lastHunk = lastDiff as DiffHunkItem;
      lastHunk.isLast = true;
      lastHunk.splitInfo = {
        startHiddenIndex: hideStart,
        endHiddenIndex: this.#splitRightLines.length,

        _startHiddenIndex: hideStart,
        _endHiddenIndex: this.#splitRightLines.length,

        // just for placeholder
        plainText: "",
        oldStartIndex: 0,
        newStartIndex: 0,
        oldLength: 0,
        newLength: 0,

        _plainText: "",
        _oldStartIndex: 0,
        _newStartIndex: 0,
        _oldLength: 0,
        _newLength: 0,
      };
      this.#splitHunksLines = {
        ...this.#splitHunksLines,
        [this.#splitRightLines.length]: lastHunk,
      };
      hideStart = Infinity;
    }

    this.splitLineLength = this.#splitRightLines.length;

    this.#hasBuildSplit = true;

    this.notifyAll();
  }

  buildUnifiedDiffLines() {
    if (this.#hasBuildUnified) return;
    let oldFileLineNumber = 1;
    let newFileLineNumber = 1;
    let prevIsHidden = true;
    let hideStart = Infinity;
    const maxOldFileLineNumber = this.#oldFileResult?.maxLineNumber || 0;
    const maxNewFileLineNumber = this.#newFileResult?.maxLineNumber || 0;

    if (__DEV__ && !this.#oldFileResult && !this.#newFileResult && this.#composeByMerge) {
      console.error(
        "this instance can not `buildUnifiedDiffLines` because of the data missing, try to use '_getFullBundle' & '_mergeFullBundle' instead of 'getBundle' & 'mergeBundle'"
      );
    }

    while (oldFileLineNumber <= maxOldFileLineNumber || newFileLineNumber <= maxNewFileLineNumber) {
      const oldRawLine = this.#getOldRawLine(oldFileLineNumber);
      const oldDiffLine = this.#getOldDiffLine(oldFileLineNumber);
      const newRawLine = this.#getNewRawLine(newFileLineNumber);
      const newDiffLine = this.#getNewDiffLine(newFileLineNumber);
      const oldLineHasChange = DiffLine.prototype.isIncludeableLine.call(oldDiffLine || {});
      const newLineHasChange = DiffLine.prototype.isIncludeableLine.call(newDiffLine || {});
      const len = this.#unifiedLines.length;
      const isHidden = !oldDiffLine && !newDiffLine;

      if (oldDiffLine && !newDiffLine) {
        if (oldDiffLine.newLineNumber && oldDiffLine.newLineNumber > newFileLineNumber) {
          newFileLineNumber++;
          continue;
        }
        if (oldDiffLine.newLineNumber === null || oldDiffLine.newLineNumber === undefined) {
          newFileLineNumber++;
        }
      }

      if (newDiffLine && !oldDiffLine) {
        if (newDiffLine.oldLineNumber && newDiffLine.oldLineNumber > oldFileLineNumber) {
          oldFileLineNumber++;
          continue;
        }
        if (newDiffLine.oldLineNumber === null || newDiffLine.oldLineNumber === undefined) {
          oldFileLineNumber++;
        }
      }

      if (!oldRawLine && !newRawLine && !newDiffLine && !oldDiffLine) break;

      if (!oldDiffLine && !newDiffLine) {
        if (this.#oldFilePlaceholderLines?.[oldFileLineNumber] && this.#newFilePlaceholderLines?.[newFileLineNumber]) {
          oldFileLineNumber++;
          newFileLineNumber++;
          continue;
        }
        if (!oldRawLine && this.#newFilePlaceholderLines?.[newFileLineNumber]) {
          newFileLineNumber++;
          continue;
        }
        if (!newRawLine && this.#oldFilePlaceholderLines?.[oldFileLineNumber]) {
          oldFileLineNumber++;
          continue;
        }
      }

      if (!oldLineHasChange && !newLineHasChange) {
        this.#unifiedLines.push({
          oldLineNumber: oldFileLineNumber++,
          newLineNumber: newFileLineNumber++,
          value: newRawLine,
          diff: newDiffLine,
          isHidden,
          _isHidden: isHidden,
        });
      } else if (oldLineHasChange) {
        this.#unifiedLines.push({
          oldLineNumber: oldFileLineNumber++,
          value: oldRawLine,
          diff: oldDiffLine,
          isHidden,
          _isHidden: isHidden,
        });
      } else if (newLineHasChange) {
        this.#unifiedLines.push({
          newLineNumber: newFileLineNumber++,
          value: newRawLine,
          diff: newDiffLine,
          isHidden,
          _isHidden: isHidden,
        });
      }

      if (!prevIsHidden && isHidden) {
        hideStart = len;
      }

      if (isHidden) {
        this.hasSomeLineCollapsed = true;
      }

      prevIsHidden = isHidden;

      if (oldDiffLine?.prevHunkLine || newDiffLine?.prevHunkLine) {
        const prevHunkLine = oldDiffLine?.prevHunkLine || newDiffLine.prevHunkLine;
        if (prevHunkLine.isFirst) {
          if (__DEV__ && Number.isFinite(hideStart)) {
            console.warn("the first hunk can not have a previous diff line");
          }
          prevHunkLine.unifiedInfo = {
            ...prevHunkLine.hunkInfo,

            startHiddenIndex: 0,
            endHiddenIndex: prevHunkLine.hunkInfo.newStartIndex - 1,
            plainText: prevHunkLine.text,

            _startHiddenIndex: 0,
            _endHiddenIndex: prevHunkLine.hunkInfo.newStartIndex - 1,
            _plainText: prevHunkLine.text,
          };
          hideStart = Infinity;
        } else if (Number.isFinite(hideStart)) {
          prevHunkLine.unifiedInfo = {
            ...prevHunkLine.hunkInfo,

            startHiddenIndex: hideStart,
            endHiddenIndex: len,
            plainText: prevHunkLine.text,

            _startHiddenIndex: hideStart,
            _endHiddenIndex: len,
            _plainText: prevHunkLine.text,
          };
          hideStart = Infinity;
        }
        this.#unifiedHunksLines = {
          ...this.#unifiedHunksLines,
          [len]: prevHunkLine,
        };
      }
    }

    // have last hunk
    if (Number.isFinite(hideStart)) {
      const lastDiff = new DiffLine("", DiffLineType.Hunk, null, null, null);
      const lastHunk = lastDiff as DiffHunkItem;
      lastHunk.isLast = true;
      lastHunk.unifiedInfo = {
        startHiddenIndex: hideStart,
        endHiddenIndex: this.#unifiedLines.length,

        _startHiddenIndex: hideStart,
        _endHiddenIndex: this.#unifiedLines.length,
        // just for placeholder

        plainText: "",
        oldStartIndex: 0,
        newStartIndex: 0,
        oldLength: 0,
        newLength: 0,

        _plainText: "",
        _oldStartIndex: 0,
        _newStartIndex: 0,
        _oldLength: 0,
        _newLength: 0,
      };
      this.#unifiedHunksLines = {
        ...this.#unifiedHunksLines,
        [this.#unifiedLines.length]: lastHunk,
      };
      hideStart = Infinity;
    }

    this.unifiedLineLength = this.#unifiedLines.length;

    this.#hasBuildUnified = true;

    this.notifyAll();
  }

  getSplitLeftLine = (index: number) => {
    return this.#splitLeftLines[index];
  };

  getSplitLineByLineNumber = (lineNumber: number, side: SplitSide) => {
    if (side === SplitSide.old) {
      return this.#splitLeftLines?.find((item) => item.lineNumber === lineNumber);
    } else {
      return this.#splitRightLines?.find((item) => item.lineNumber === lineNumber);
    }
  };

  getSplitLineIndexByLineNumber = (lineNumber: number, side: SplitSide) => {
    if (side === SplitSide.old) {
      return this.#splitLeftLines?.findIndex((item) => item.lineNumber === lineNumber);
    } else {
      return this.#splitRightLines?.findIndex((item) => item.lineNumber === lineNumber);
    }
  };

  getSplitRightLine = (index: number) => {
    return this.#splitRightLines[index];
  };

  getSplitHunkLine = (index: number) => {
    return this.#splitHunksLines?.[index];
  };

  onSplitHunkExpand = (dir: "up" | "down" | "all", index: number, needTrigger = true) => {
    const current = this.#splitHunksLines?.[index];
    if (!current || !current.splitInfo) return;

    if (this.#composeByDiff) return;

    if (dir === "all") {
      for (let i = current.splitInfo.startHiddenIndex; i < current.splitInfo.endHiddenIndex; i++) {
        const leftLine = this.#splitLeftLines[i];
        const rightLine = this.#splitRightLines[i];
        if (leftLine?.isHidden) leftLine.isHidden = false;
        if (rightLine?.isHidden) rightLine.isHidden = false;
      }
      current.splitInfo = {
        ...current.splitInfo,
        ...current.hunkInfo,
        plainText: current.text,
        startHiddenIndex: current.splitInfo.endHiddenIndex,
      };
    } else if (dir === "down") {
      for (let i = current.splitInfo.startHiddenIndex; i < current.splitInfo.startHiddenIndex + composeLen; i++) {
        const leftLine = this.#splitLeftLines[i];
        const rightLine = this.#splitRightLines[i];
        if (leftLine?.isHidden) leftLine.isHidden = false;
        if (rightLine?.isHidden) rightLine.isHidden = false;
      }
      if (current.isLast) {
        current.splitInfo = {
          ...current.splitInfo,
          startHiddenIndex: current.splitInfo.startHiddenIndex + composeLen,
        };
      } else {
        current.splitInfo = {
          ...current.splitInfo,
          startHiddenIndex: current.splitInfo.startHiddenIndex + composeLen,
          plainText: `@@ -${current.splitInfo.oldStartIndex},${current.splitInfo.oldLength} +${current.splitInfo.newStartIndex},${current.splitInfo.newLength}`,
        };
      }
    } else {
      if (current.isLast) {
        if (__DEV__) {
          console.error("the last hunk can not expand up!");
        }
        return;
      }
      for (let i = current.splitInfo.endHiddenIndex - composeLen; i < current.splitInfo.endHiddenIndex; i++) {
        const leftLine = this.#splitLeftLines[i];
        const rightLine = this.#splitRightLines[i];
        if (leftLine?.isHidden) leftLine.isHidden = false;
        if (rightLine?.isHidden) rightLine.isHidden = false;
      }
      const oldStartIndex = current.splitInfo.oldStartIndex - composeLen;
      const oldLength = current.splitInfo.oldLength + composeLen;
      const newStartIndex = current.splitInfo.newStartIndex - composeLen;
      const newLength = current.splitInfo.newLength + composeLen;
      current.splitInfo = {
        ...current.splitInfo,
        endHiddenIndex: current.splitInfo.endHiddenIndex - composeLen,
        oldStartIndex,
        oldLength,
        newStartIndex,
        newLength,
        plainText: `@@ -${oldStartIndex},${oldLength} +${newStartIndex},${newLength}`,
      };

      delete this.#splitHunksLines?.[index];

      this.#splitHunksLines![current.splitInfo.endHiddenIndex] = current;
    }

    if (needTrigger) {
      this.notifyAll();
    }
  };

  getUnifiedLine = (index: number) => {
    return this.#unifiedLines[index];
  };

  getUnifiedLineByLineNumber = (lienNumber: number, side: SplitSide) => {
    if (side === SplitSide.old) {
      return this.#unifiedLines?.find((item) => item.oldLineNumber === lienNumber);
    } else {
      return this.#unifiedLines?.find((item) => item.newLineNumber === lienNumber);
    }
  };

  getUnifiedLineIndexByLineNumber = (lineNumber: number, side: SplitSide) => {
    if (side === SplitSide.old) {
      return this.#unifiedLines?.findIndex((item) => item.oldLineNumber === lineNumber);
    } else {
      return this.#unifiedLines?.findIndex((item) => item.newLineNumber === lineNumber);
    }
  };

  getUnifiedHunkLine = (index: number) => {
    return this.#unifiedHunksLines?.[index];
  };

  // TODO! support rollback?
  onUnifiedHunkExpand = (dir: "up" | "down" | "all", index: number, needTrigger = true) => {
    if (this.#composeByDiff) return;

    const current = this.#unifiedHunksLines?.[index];

    if (!current || !current.unifiedInfo) return;

    if (dir === "all") {
      for (let i = current.unifiedInfo.startHiddenIndex; i < current.unifiedInfo.endHiddenIndex; i++) {
        const unifiedLine = this.#unifiedLines?.[i];
        if (unifiedLine?.isHidden) {
          unifiedLine.isHidden = false;
        }
      }
      current.unifiedInfo = {
        ...current.unifiedInfo,
        ...current.hunkInfo,
        plainText: current.text,
        startHiddenIndex: current.unifiedInfo.endHiddenIndex,
      };
    } else if (dir === "down") {
      for (let i = current.unifiedInfo.startHiddenIndex; i < current.unifiedInfo.startHiddenIndex + composeLen; i++) {
        const unifiedLine = this.#unifiedLines[i];
        if (unifiedLine?.isHidden) unifiedLine.isHidden = false;
      }
      if (current.isLast) {
        current.unifiedInfo = {
          ...current.unifiedInfo,
          startHiddenIndex: current.unifiedInfo.startHiddenIndex + composeLen,
        };
      } else {
        current.unifiedInfo = {
          ...current.unifiedInfo,
          startHiddenIndex: current.unifiedInfo.startHiddenIndex + composeLen,
          plainText: `@@ -${current.unifiedInfo.oldStartIndex},${current.unifiedInfo.oldLength} +${current.unifiedInfo.newStartIndex},${current.unifiedInfo.newLength}`,
        };
      }
    } else {
      if (current.isLast) {
        if (__DEV__) {
          console.error("the last hunk can not expand up!");
        }
        return;
      }
      for (let i = current.unifiedInfo.endHiddenIndex - composeLen; i < current.unifiedInfo.endHiddenIndex; i++) {
        const unifiedLine = this.#unifiedLines[i];
        if (unifiedLine?.isHidden) unifiedLine.isHidden = false;
      }
      const oldStartIndex = current.unifiedInfo.oldStartIndex - composeLen;
      const oldLength = current.unifiedInfo.oldLength + composeLen;
      const newStartIndex = current.unifiedInfo.newStartIndex - composeLen;
      const newLength = current.unifiedInfo.newLength + composeLen;
      current.unifiedInfo = {
        ...current.unifiedInfo,
        endHiddenIndex: current.unifiedInfo.endHiddenIndex - composeLen,
        oldStartIndex,
        oldLength,
        newStartIndex,
        newLength,
        plainText: `@@ -${oldStartIndex},${oldLength} +${newStartIndex},${newLength}`,
      };

      delete this.#unifiedHunksLines?.[index];

      this.#unifiedHunksLines![current.unifiedInfo.endHiddenIndex] = current;
    }

    if (needTrigger) {
      this.notifyAll();
    }
  };

  onAllExpand = (mode: "split" | "unified") => {
    if (this.#composeByDiff) return;

    if (mode === "split") {
      Object.keys(this.#splitHunksLines || {}).forEach((key) => {
        this.onSplitHunkExpand("all", +key, false);
      });
      this.#hasExpandSplitAll.state = true;
    } else {
      Object.keys(this.#unifiedHunksLines || {}).forEach((key) => {
        this.onUnifiedHunkExpand("all", +key, false);
      });
      this.#hasExpandUnifiedAll.state = true;
    }

    this.notifyAll();
  };

  get hasExpandSplitAll() {
    return this.#hasExpandSplitAll.state;
  }

  get hasExpandUnifiedAll() {
    return this.#hasExpandUnifiedAll.state;
  }

  onAllCollapse = (mode: "split" | "unified") => {
    if (this.#composeByDiff) return;

    if (mode === "split") {
      Object.values(this.#splitLeftLines || {}).forEach((item) => {
        if (!item.isHidden && item._isHidden) {
          item.isHidden = item._isHidden;
        }
      });
      Object.values(this.#splitRightLines || {}).forEach((item) => {
        if (!item.isHidden && item._isHidden) {
          item.isHidden = item._isHidden;
        }
      });
      Object.values(this.#splitHunksLines || {}).forEach((item) => {
        if (!item.splitInfo) return;
        item.splitInfo = {
          ...item.splitInfo,
          oldStartIndex: item.splitInfo._oldStartIndex,
          oldLength: item.splitInfo._oldLength,
          newStartIndex: item.splitInfo._newStartIndex,
          newLength: item.splitInfo._newLength,
          startHiddenIndex: item.splitInfo._startHiddenIndex,
          endHiddenIndex: item.splitInfo._endHiddenIndex,
          plainText: item.splitInfo._plainText,
        };
      });
      Object.keys(this.#splitHunksLines || {}).forEach((key) => {
        const item = this.#splitHunksLines![key];
        if (!item.splitInfo) return;
        if (item.splitInfo.endHiddenIndex !== +key) {
          delete this.#splitHunksLines![key];

          this.#splitHunksLines![item.splitInfo.endHiddenIndex] = item;
        }
      });
      this.#hasExpandSplitAll.state = false;
    } else {
      Object.values(this.#unifiedLines || {}).forEach((item) => {
        if (!item.isHidden && item._isHidden) {
          item.isHidden = item._isHidden;
        }
      });
      Object.values(this.#unifiedHunksLines || {}).forEach((item) => {
        if (!item.unifiedInfo) return;
        item.unifiedInfo = {
          ...item.unifiedInfo,
          oldStartIndex: item.unifiedInfo._oldStartIndex,
          oldLength: item.unifiedInfo._oldLength,
          newStartIndex: item.unifiedInfo._newStartIndex,
          newLength: item.unifiedInfo._newLength,
          startHiddenIndex: item.unifiedInfo._startHiddenIndex,
          endHiddenIndex: item.unifiedInfo._endHiddenIndex,
          plainText: item.unifiedInfo._plainText,
        };
      });
      Object.keys(this.#unifiedHunksLines || {}).forEach((key) => {
        const item = this.#unifiedHunksLines![key];
        if (!item.unifiedInfo) return;
        if (item.unifiedInfo.endHiddenIndex !== +key) {
          delete this.#unifiedHunksLines![key];

          this.#unifiedHunksLines![item.unifiedInfo.endHiddenIndex] = item;
        }
      });
      this.#hasExpandUnifiedAll.state = false;
    }

    this.notifyAll();
  };

  getOldFileContent = () => {
    return this.#oldFileResult?.raw;
  };

  getNewFileContent = () => {
    return this.#newFileResult?.raw;
  };

  getOldPlainLine = (lineNumber: number) => {
    return this.#oldFilePlainLines?.[lineNumber];
  };

  getOldSyntaxLine = (lineNumber: number) => {
    return this.#oldFileSyntaxLines?.[lineNumber];
  };

  getNewPlainLine = (lineNumber: number) => {
    return this.#newFilePlainLines?.[lineNumber];
  };

  getNewSyntaxLine = (lineNumber: number) => {
    return this.#newFileSyntaxLines?.[lineNumber];
  };

  // TODO improve
  subscribe = (listener: (() => void) & { isSyncExternal?: boolean }) => {
    this.#listeners.push(listener);

    return () => {
      this.#listeners = this.#listeners.filter((i) => i !== listener);
    };
  };

  notifyAll = (skipSyncExternal?: boolean) => {
    this.#updateCount++;

    this.#listeners.forEach((f) => {
      if (skipSyncExternal && f.isSyncExternal) {
        return;
      }
      f();
    });

    // support update from outside instance
    this.#clonedInstance.forEach((_, instance) => {
      instance.notifyAll(true);
    });
  };

  getUpdateCount = () => this.#updateCount;

  getExpandEnabled = () => !this.#composeByDiff;

  getBundle = () => {
    // common
    const hasInitRaw = this.#hasInitRaw;
    const hasInitSyntax = this.#hasInitSyntax;
    const hasBuildSplit = this.#hasBuildSplit;
    const hasBuildUnified = this.#hasBuildUnified;
    const oldFileLines = this.#oldFileLines;
    const oldFileDiffLines = this.#oldFileDiffLines;
    const oldFilePlainLines = this.#oldFilePlainLines;
    const oldFileSyntaxLines = this.#oldFileSyntaxLines;
    const oldFilePlaceholderLines = this.#oldFilePlaceholderLines;
    const newFileLines = this.#newFileLines;
    const newFileDiffLines = this.#newFileDiffLines;
    const newFilePlainLines = this.#newFilePlainLines;
    const newFileSyntaxLines = this.#newFileSyntaxLines;
    const newFilePlaceholderLines = this.#newFilePlaceholderLines;
    const splitLineLength = this.splitLineLength;
    const unifiedLineLength = this.unifiedLineLength;
    const fileLineLength = this.fileLineLength;
    const additionLength = this.additionLength;
    const deletionLength = this.deletionLength;
    const composeByDiff = this.#composeByDiff;
    const highlighterName = this.#highlighterName;
    const highlighterType = this.#highlighterType;
    const hasSomeLineCollapsed = this.hasSomeLineCollapsed;
    const hasExpandSplitAll = this.#hasExpandSplitAll;
    const hasExpandUnifiedAll = this.#hasExpandUnifiedAll;

    // split
    const splitLeftLines = this.#splitLeftLines;
    const splitRightLines = this.#splitRightLines;
    const splitHunkLines = this.#splitHunksLines;

    // unified
    const unifiedLines = this.#unifiedLines;
    const unifiedHunkLines = this.#unifiedHunksLines;

    const version = this._version_;
    const theme = this.#theme;
    const enableTemplate = this.#enableTemplate;

    return {
      hasInitRaw,
      hasInitSyntax,
      hasBuildSplit,
      hasBuildUnified,
      oldFileLines,
      oldFileDiffLines,
      oldFilePlainLines,
      oldFileSyntaxLines,
      oldFilePlaceholderLines,
      newFileLines,
      newFileDiffLines,
      newFilePlainLines,
      newFileSyntaxLines,
      newFilePlaceholderLines,
      splitLineLength,
      unifiedLineLength,
      fileLineLength,
      additionLength,
      deletionLength,
      splitLeftLines,
      splitRightLines,
      splitHunkLines,
      unifiedLines,
      unifiedHunkLines,

      highlighterName,
      highlighterType,
      composeByDiff,
      hasSomeLineCollapsed,
      hasExpandSplitAll,
      hasExpandUnifiedAll,

      version,

      theme,

      enableTemplate,

      isFullMerge: false,
    };
  };

  mergeBundle = (data: ReturnType<DiffFile["getBundle"]>, notifyUpdate = true) => {
    this.#hasInitRaw = data.hasInitRaw;
    this.#hasInitSyntax = data.hasInitSyntax;
    this.#hasBuildSplit = data.hasBuildSplit;
    this.#hasBuildUnified = data.hasBuildUnified;
    this.#composeByDiff = data.composeByDiff;
    this.#highlighterName = data.highlighterName;
    this.#highlighterType = data.highlighterType;

    this.#oldFileLines = data.oldFileLines;
    this.#oldFileDiffLines = data.oldFileDiffLines;
    this.#oldFilePlainLines = data.oldFilePlainLines;
    this.#oldFileSyntaxLines = data.oldFileSyntaxLines;
    this.#oldFilePlaceholderLines = data.oldFilePlaceholderLines;
    this.#newFileLines = data.newFileLines;
    this.#newFileDiffLines = data.newFileDiffLines;
    this.#newFilePlainLines = data.newFilePlainLines;
    this.#newFileSyntaxLines = data.newFileSyntaxLines;
    this.#newFilePlaceholderLines = data.newFilePlaceholderLines;
    this.splitLineLength = data.splitLineLength;
    this.unifiedLineLength = data.unifiedLineLength;
    this.fileLineLength = data.fileLineLength;
    this.additionLength = data.additionLength;
    this.deletionLength = data.deletionLength;
    this.hasSomeLineCollapsed = data.hasSomeLineCollapsed;
    this.#hasExpandSplitAll = data.hasExpandSplitAll;
    this.#hasExpandUnifiedAll = data.hasExpandUnifiedAll;

    this.#splitLeftLines = data.splitLeftLines;
    this.#splitRightLines = data.splitRightLines;
    this.#splitHunksLines = data.splitHunkLines;

    this.#unifiedLines = data.unifiedLines;
    this.#unifiedHunksLines = data.unifiedHunkLines;

    this.#theme = data.theme;

    this.#enableTemplate = data.enableTemplate;

    // mark this instance as a merged instance
    this.#composeByMerge = true;

    if (__DEV__ && this._version_ !== data.version) {
      console.error("the version of the `diffInstance` is not match, some error may happen");
    }

    if (__DEV__ && !data.hasInitRaw) {
      console.error(`there are not a valid bundle data, try to call 'initRaw' function before merge / getBundle`);
    }

    if (notifyUpdate) {
      this.notifyAll();
    }
  };

  _getHighlighterName = () => this.#highlighterName || "";

  _getIsPureDiffRender = () => this.#composeByDiff;

  _getTheme = () => this.#theme;

  _addClonedInstance = (instance: DiffFile) => {
    const updateFunc = () => {
      this._notifyOthers(instance);
      // sync state from child instance trigger update
      this._mergeFullBundle(instance._getFullBundle(), false);
    };

    updateFunc.isSyncExternal = true;

    const unsubscribe = instance.subscribe(updateFunc);

    this.#clonedInstance.set(instance, unsubscribe);
  };

  _notifyOthers = (instance: DiffFile) => {
    this.#clonedInstance.forEach((_, i) => {
      if (i !== instance) {
        i.notifyAll(true);
      }
    });
  };

  _delClonedInstance = (instance: DiffFile) => {
    const unsubscribe = this.#clonedInstance.get(instance);

    unsubscribe?.();

    this.#clonedInstance.delete(instance);
  };

  _getFullBundle = () => {
    const bundle = this.getBundle();
    const oldFileResult = this.#oldFileResult;
    const newFileResult = this.#newFileResult;
    const diffLines = this.#diffLines;
    const diffListResults = this.#diffListResults;

    return {
      ...bundle,
      oldFileResult,
      newFileResult,
      diffLines,
      diffListResults,
      // get current instance is a fullMerge instance or not
      isFullMerge: this.#composeByMerge ? this.#composeByFullMerge : true,
    };
  };

  _mergeFullBundle = (data: ReturnType<DiffFile["_getFullBundle"]>, notifyUpdate = true) => {
    this.mergeBundle(data, notifyUpdate);
    try {
      this.#oldFileResult = data.oldFileResult ? File.createInstance(data.oldFileResult) : null;

      this.#newFileResult = data.newFileResult ? File.createInstance(data.newFileResult) : null;

      this.#diffLines = data.diffLines;

      this.#diffListResults = data.diffListResults;

      this.#composeByFullMerge = data.isFullMerge;
    } catch {
      void 0;
    }
  };

  _destroy = () => {
    this.clearId();
    this.#listeners.splice(0, this.#listeners.length);
    this.#clonedInstance.forEach((v) => v());
    this.#clonedInstance.clear();
  };

  clear = () => {
    this._destroy();
    this.#oldFileResult = null;
    this.#newFileResult = null;
    this.#diffLines = null;
    this.#diffListResults = null;
    this.#newFileDiffLines = null;
    this.#oldFileDiffLines = null;
    this.#newFileLines = null;
    this.#oldFileLines = null;
    this.#newFileSyntaxLines = null;
    this.#oldFileSyntaxLines = null;
    this.#splitHunksLines = null;
    this.#splitLeftLines = null;
    this.#splitRightLines = null;
    this.#unifiedHunksLines = null;
    this.#unifiedLines = null;
    this.#theme = undefined;
  };
}

if (__DEV__) {
  Object.defineProperty(DiffFile.prototype, "__full_bundle__", {
    get: function (this: DiffFile) {
      return this._getFullBundle();
    },
  });
}
