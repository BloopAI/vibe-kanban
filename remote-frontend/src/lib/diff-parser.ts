export interface ParsedHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface ParsedFileDiff {
  oldPath: string;
  newPath: string;
  hunks: ParsedHunk[];
  rawDiff: string;
}

export function parseUnifiedDiff(diffText: string): ParsedFileDiff[] {
  const files: ParsedFileDiff[] = [];
  const lines = diffText.split("\n");

  let currentFile: ParsedFileDiff | null = null;
  let currentHunk: ParsedHunk | null = null;
  let fileStartIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("diff --git")) {
      if (currentHunk && currentFile) currentFile.hunks.push(currentHunk);
      if (currentFile) {
        currentFile.rawDiff = lines.slice(fileStartIdx, i).join("\n");
        files.push(currentFile);
      }
      currentFile = { oldPath: "", newPath: "", hunks: [], rawDiff: "" };
      currentHunk = null;
      fileStartIdx = i;
    } else if (line.startsWith("--- ")) {
      if (currentFile) {
        currentFile.oldPath = line.slice(4).replace(/^a\//, "");
      }
    } else if (line.startsWith("+++ ")) {
      if (currentFile) {
        currentFile.newPath = line.slice(4).replace(/^b\//, "");
      }
    } else if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)?/);
      if (match && currentFile) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        currentHunk = {
          header: line,
          oldStart: parseInt(match[1], 10),
          oldLines: match[2] ? parseInt(match[2], 10) : 1,
          newStart: parseInt(match[3], 10),
          newLines: match[4] ? parseInt(match[4], 10) : 1,
          lines: [],
        };
      }
    } else if (
      currentHunk &&
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))
    ) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk && currentFile) currentFile.hunks.push(currentHunk);
  if (currentFile) {
    currentFile.rawDiff = lines.slice(fileStartIdx).join("\n");
    files.push(currentFile);
  }

  return files;
}

export function getFileDiff(
  parsedDiffs: ParsedFileDiff[],
  filePath: string,
): ParsedFileDiff | undefined {
  return parsedDiffs.find(
    (f) => f.newPath === filePath || f.oldPath === filePath,
  );
}

export function hunkOverlapsRange(
  hunk: ParsedHunk,
  startLine: number,
  endLine: number,
): boolean {
  const hunkEnd = hunk.newStart + hunk.newLines - 1;
  return hunk.newStart <= endLine && hunkEnd >= startLine;
}

export function filterHunksToRange(
  fileDiff: ParsedFileDiff,
  startLine: number,
  endLine: number,
  contextLines: number = 3,
): string {
  const expandedStart = Math.max(1, startLine - contextLines);
  const expandedEnd = endLine + contextLines;

  const relevantHunks = fileDiff.hunks.filter((h) =>
    hunkOverlapsRange(h, expandedStart, expandedEnd),
  );

  if (relevantHunks.length === 0) {
    return "";
  }

  const diffLines: string[] = [];
  diffLines.push(`--- a/${fileDiff.oldPath}`);
  diffLines.push(`+++ b/${fileDiff.newPath}`);

  for (const hunk of relevantHunks) {
    diffLines.push(hunk.header);
    diffLines.push(...hunk.lines);
  }

  return diffLines.join("\n");
}

export function buildFullFileDiff(fileDiff: ParsedFileDiff): string {
  if (fileDiff.hunks.length === 0) {
    return "";
  }

  const diffLines: string[] = [];
  diffLines.push(`--- a/${fileDiff.oldPath}`);
  diffLines.push(`+++ b/${fileDiff.newPath}`);

  for (const hunk of fileDiff.hunks) {
    diffLines.push(hunk.header);
    diffLines.push(...hunk.lines);
  }

  return diffLines.join("\n") + "\n";
}

export interface HunkLineInfo {
  newLineNumber: number | null;
  oldLineNumber: number | null;
  type: "add" | "delete" | "context";
  content: string;
}

export function parseHunkLines(hunk: ParsedHunk): HunkLineInfo[] {
  const result: HunkLineInfo[] = [];
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;

  for (const line of hunk.lines) {
    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === "+") {
      result.push({
        newLineNumber: newLine,
        oldLineNumber: null,
        type: "add",
        content,
      });
      newLine++;
    } else if (prefix === "-") {
      result.push({
        newLineNumber: null,
        oldLineNumber: oldLine,
        type: "delete",
        content,
      });
      oldLine++;
    } else {
      result.push({
        newLineNumber: newLine,
        oldLineNumber: oldLine,
        type: "context",
        content,
      });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

export function synthesizeFragmentDiff(
  fileDiff: ParsedFileDiff,
  newFileContent: string,
  startLine: number,
  endLine: number,
  contextLines: number = 3,
): string {
  const newFileLines = newFileContent.split(/\r?\n/);
  const expandedStart = Math.max(1, startLine - contextLines);
  const expandedEnd = Math.min(newFileLines.length, endLine + contextLines);

  const relevantHunks = fileDiff.hunks.filter((h) =>
    hunkOverlapsRange(h, expandedStart, expandedEnd),
  );

  const changeMap = new Map<
    number,
    { type: "add" | "context"; deletionsBefore: string[] }
  >();

  for (let i = expandedStart; i <= expandedEnd; i++) {
    changeMap.set(i, { type: "context", deletionsBefore: [] });
  }

  for (const hunk of relevantHunks) {
    const lines = parseHunkLines(hunk);
    let pendingDeletions: string[] = [];

    for (const line of lines) {
      if (line.type === "delete") {
        pendingDeletions.push(line.content);
      } else {
        const newLineNum = line.newLineNumber!;
        if (newLineNum >= expandedStart && newLineNum <= expandedEnd) {
          const existing = changeMap.get(newLineNum)!;
          existing.deletionsBefore.push(...pendingDeletions);
          if (line.type === "add") {
            existing.type = "add";
          }
        }
        pendingDeletions = [];
      }
    }

    if (pendingDeletions.length > 0) {
      const lastNewLine = Math.min(
        hunk.newStart + hunk.newLines,
        expandedEnd + 1,
      );
      if (lastNewLine <= expandedEnd) {
        const existing = changeMap.get(lastNewLine);
        if (existing) {
          existing.deletionsBefore.push(...pendingDeletions);
        }
      }
    }
  }

  const outputLines: string[] = [];
  let oldLineCount = 0;
  let newLineCount = 0;

  for (let i = expandedStart; i <= expandedEnd; i++) {
    const info = changeMap.get(i)!;
    const lineContent = newFileLines[i - 1] ?? "";

    for (const del of info.deletionsBefore) {
      outputLines.push(`-${del}`);
      oldLineCount++;
    }

    if (info.type === "add") {
      outputLines.push(`+${lineContent}`);
      newLineCount++;
    } else {
      outputLines.push(` ${lineContent}`);
      oldLineCount++;
      newLineCount++;
    }
  }

  const oldStart = expandedStart;
  const header = `@@ -${oldStart},${oldLineCount} +${expandedStart},${newLineCount} @@`;

  if (outputLines.length === 0) {
    return "";
  }

  const diffLines: string[] = [];
  diffLines.push(`--- a/${fileDiff.oldPath}`);
  diffLines.push(`+++ b/${fileDiff.newPath}`);
  diffLines.push(header);
  diffLines.push(...outputLines);

  return diffLines.join("\n") + "\n";
}
