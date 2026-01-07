import type { DiffRange, IRange } from "./change-range";

/** indicate what a line in the diff represents */
export enum DiffLineType {
  Context,
  Add,
  Delete,
  Hunk,
}

/** track details related to each line in the diff */
export class DiffLine {
  public constructor(
    public readonly text: string,
    public readonly type: DiffLineType,
    // Line number in the original diff patch (before expanding it), or null if
    // it was added as part of a diff expansion action.
    public readonly originalLineNumber: number | null,
    public readonly oldLineNumber: number | null,
    public readonly newLineNumber: number | null,
    public readonly noTrailingNewLine: boolean = false,
    public changes?: IRange,
    public diffChanges?: DiffRange,
    public plainTemplate?: string,
    public syntaxTemplate?: string
  ) {}

  public withNoTrailingNewLine(noTrailingNewLine: boolean): DiffLine {
    return new DiffLine(
      this.text,
      this.type,
      this.originalLineNumber,
      this.oldLineNumber,
      this.newLineNumber,
      noTrailingNewLine
    );
  }

  public isIncludeableLine() {
    return this.type === DiffLineType.Add || this.type === DiffLineType.Delete;
  }

  public equals(other: DiffLine) {
    return (
      this.text === other.text &&
      this.type === other.type &&
      this.originalLineNumber === other.originalLineNumber &&
      this.oldLineNumber === other.oldLineNumber &&
      this.newLineNumber === other.newLineNumber &&
      this.noTrailingNewLine === other.noTrailingNewLine
    );
  }

  public clone(text: string) {
    return new DiffLine(
      text,
      this.type,
      this.originalLineNumber,
      this.oldLineNumber,
      this.newLineNumber,
      this.noTrailingNewLine
    );
  }
}

export const checkDiffLineIncludeChange = (diffLine?: DiffLine) => {
  if (!diffLine) return false;
  return diffLine.type === DiffLineType.Add || diffLine.type === DiffLineType.Delete;
};
