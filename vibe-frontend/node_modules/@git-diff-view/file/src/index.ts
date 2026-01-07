import { DiffFile, _cacheMap } from "@git-diff-view/core";
import { createTwoFilesPatch, type PatchOptions } from "diff";

import type { DiffHighlighterLang } from "@git-diff-view/core";

_cacheMap.name = "@git-diff-view/file";

export function generateDiffFile(
  oldFileName: string,
  oldFileContent: string,
  newFileName: string,
  newFileContent: string,
  oldFileLang: DiffHighlighterLang,
  newFileLang: DiffHighlighterLang,
  option?: PatchOptions,
  uuid?: string
): DiffFile;
export function generateDiffFile(
  oldFileName: string,
  oldFileContent: string,
  newFileName: string,
  newFileContent: string,
  oldFileLang: string,
  newFileLang: string,
  option?: PatchOptions,
  uuid?: string
): DiffFile;
export function generateDiffFile(
  oldFileName: string,
  oldFileContent: string,
  newFileName: string,
  newFileContent: string,
  oldFileLang: DiffHighlighterLang | string,
  newFileLang: DiffHighlighterLang | string,
  option?: PatchOptions,
  uuid?: string
) {
  const diffString = createTwoFilesPatch(oldFileName, newFileName, oldFileContent, newFileContent, "", "", option);

  return new DiffFile(
    oldFileName,
    oldFileContent,
    newFileName,
    newFileContent,
    [diffString],
    oldFileLang,
    newFileLang,
    uuid
  );
}

export * from "@git-diff-view/core";
