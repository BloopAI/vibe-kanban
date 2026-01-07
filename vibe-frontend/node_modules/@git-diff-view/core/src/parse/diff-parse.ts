/* eslint-disable max-lines */

// !NOTE: ALL of the diff parse logic copy from desktop, SEE https://github.com/desktop/desktop
// With mirror change

// https://en.wikipedia.org/wiki/Diff_utility
//
// @@ -l,s +l,s @@ optional section heading
//
// The hunk range information contains two hunk ranges. The range for the hunk of the original
// file is preceded by a minus symbol, and the range for the new file is preceded by a plus
// symbol. Each hunk range is of the format l,s where l is the starting line number and s is
// the number of lines the change hunk applies to for each respective file.
//
// In many versions of GNU diff, each range can omit the comma and trailing value s,

import { DiffLine, DiffLineType } from "./diff-line";
import { assertNever, getHunkHeaderExpansionType, getLargestLineNumber } from "./diff-tool";
import { DiffHunk, DiffHunkHeader } from "./raw-diff";

import type { IRawDiff } from "./raw-diff";

// in which case s defaults to 1
const diffHeaderRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Regular expression matching invisible bidirectional Unicode characters that
 * may be interpreted or compiled differently than what it appears. More info:
 * https://github.co/hiddenchars
 */
export const HiddenBidiCharsRegex = /[\u202A-\u202E]|[\u2066-\u2069]/;

const DiffPrefixAdd = "+" as const;
const DiffPrefixDelete = "-" as const;
const DiffPrefixContext = " " as const;
const DiffPrefixNoNewline = "\\" as const;

type DiffLinePrefix =
  | typeof DiffPrefixAdd
  | typeof DiffPrefixDelete
  | typeof DiffPrefixContext
  | typeof DiffPrefixNoNewline;
const DiffLinePrefixChars: Set<DiffLinePrefix> = new Set([
  DiffPrefixAdd,
  DiffPrefixDelete,
  DiffPrefixContext,
  DiffPrefixNoNewline,
]);

interface IDiffHeaderInfo {
  /**
   * Whether or not the diff header contained a marker indicating
   * that a diff couldn't be produced due to the contents of the
   * new and/or old file was binary.
   */
  readonly isBinary: boolean;
}

/**
 * A parser for the GNU unified diff format
 *
 * See https://www.gnu.org/software/diffutils/manual/html_node/Detailed-Unified.html
 */
export class DiffParser {
  /**
   * Line start pointer.
   *
   * The offset into the text property where the current line starts (ie either zero
   * or one character ahead of the last newline character).
   */
  private ls!: number;

  /**
   * Line end pointer.
   *
   * The offset into the text property where the current line ends (ie it points to
   * the newline character) or -1 if the line boundary hasn't been determined yet
   */
  private le!: number;

  /**
   * The text buffer containing the raw, unified diff output to be parsed
   */
  private text!: string;

  public constructor() {
    Object.defineProperty(this, "__v_skip", { value: true });
    this.reset();
  }

  /**
   * Resets the internal parser state so that it can be reused.
   *
   * This is done automatically at the end of each parse run.
   */
  private reset() {
    this.ls = 0;
    this.le = -1;
    this.text = "";
  }

  /**
   * Aligns the internal character pointers at the boundaries of
   * the next line.
   *
   * Returns true if successful or false if the end of the diff
   * has been reached.
   */
  private nextLine(): boolean {
    this.ls = this.le + 1;

    // We've reached the end of the diff
    if (this.ls >= this.text.length) {
      return false;
    }

    this.le = this.text.indexOf("\n", this.ls);

    // If we can't find the next newline character we'll put our
    // end pointer at the end of the diff string
    if (this.le === -1) {
      this.le = this.text.length;
    }

    // We've succeeded if there's anything to read in between the
    // start and the end
    return this.ls !== this.le;
  }

  /**
   * Advances to the next line and returns it as a substring
   * of the raw diff text. Returns null if end of diff was
   * reached.
   */
  private readLine(header: boolean): string | null {
    if (header) {
      return this.nextLine() ? this.text.substring(this.ls, this.le) : null;
    } else {
      return this.nextLine() ? this.text.substring(this.ls + 1, this.le + 1) : null;
    }
  }

  /** Tests if the current line starts with the given search text */
  private lineStartsWith(searchString: string): boolean {
    return this.text.startsWith(searchString, this.ls);
  }

  /** Tests if the current line ends with the given search text */
  private lineEndsWith(searchString: string): boolean {
    return this.text.endsWith(searchString, this.le);
  }

  /**
   * Returns the starting character of the next line without
   * advancing the internal state. Returns null if advancing
   * would mean reaching the end of the diff.
   */
  private peek(): string | null {
    const p = this.le + 1;
    return p < this.text.length ? this.text[p] : null;
  }

  /**
   * Parse the diff header, meaning everything from the
   * start of the diff output to the end of the line beginning
   * with +++
   *
   * Example diff header:
   *
   *   diff --git a/app/src/lib/diff-parser.ts b/app/src/lib/diff-parser.ts
   *   index e1d4871..3bd3ee0 100644
   *   --- a/app/src/lib/diff-parser.ts
   *   +++ b/app/src/lib/diff-parser.ts
   *
   * Returns an object with information extracted from the diff
   * header (currently whether it's a binary patch) or null if
   * the end of the diff was reached before the +++ line could be
   * found (which is a valid state).
   */
  private parseDiffHeader(): IDiffHeaderInfo | null {
    // TODO: There's information in here that we might want to
    // capture, such as mode changes
    while (this.nextLine()) {
      if (this.lineStartsWith("Binary files ") && this.lineEndsWith("differ")) {
        return { isBinary: true };
      }

      if (this.lineStartsWith("+++")) {
        return { isBinary: false };
      }
    }

    // It's not an error to not find the +++ line, see the
    // 'parses diff of empty file' test in diff-parser-tests.ts
    return null;
  }

  /**
   * Attempts to convert a RegExp capture group into a number.
   * If the group doesn't exist or wasn't captured the function
   * will return the value of the defaultValue parameter or throw
   * an error if no default value was provided. If the captured
   * string can't be converted to a number an error will be thrown.
   */
  private numberFromGroup(m: RegExpMatchArray, group: number, defaultValue: number | null = null): number {
    const str = m[group];
    if (!str) {
      if (!defaultValue) {
        throw new Error(`Group ${group} missing from regexp match and no defaultValue was provided`);
      }

      return defaultValue;
    }

    const num = parseInt(str, 10);

    if (isNaN(num)) {
      throw new Error(`Could not parse capture group ${group} into number: ${str}`);
    }

    return num;
  }

  /**
   * Parses a hunk header or throws an error if the given line isn't
   * a well-formed hunk header.
   *
   * We currently only extract the line number information and
   * ignore any hunk headings.
   *
   * Example hunk header (text within ``):
   *
   * `@@ -84,10 +82,8 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {`
   *
   * Where everything after the last @@ is what's known as the hunk, or section, heading
   */
  private parseHunkHeader(line: string): DiffHunkHeader {
    const m = diffHeaderRe.exec(line);
    if (!m) {
      throw new Error(`Invalid hunk header format`);
    }

    // If endLines are missing default to 1, see diffHeaderRe docs
    const oldStartLine = this.numberFromGroup(m, 1);
    const oldLineCount = this.numberFromGroup(m, 2, 1);
    const newStartLine = this.numberFromGroup(m, 3);
    const newLineCount = this.numberFromGroup(m, 4, 1);

    return new DiffHunkHeader(oldStartLine, oldLineCount, newStartLine, newLineCount);
  }

  /**
   * Convenience function which lets us leverage the type system to
   * prove exhaustive checks in parseHunk.
   *
   * Takes an arbitrary string and checks to see if the first character
   * of that string is one of the allowed prefix characters for diff
   * lines (ie lines in between hunk headers).
   */
  private parseLinePrefix(c: string | null): DiffLinePrefix | null {
    // Since we know that DiffLinePrefixChars and the DiffLinePrefix type
    // include the same characters we can tell the type system that we
    // now know that c[0] is one of the characters in the DifflinePrefix set
    if (c && c.length && (DiffLinePrefixChars as Set<string>).has(c[0])) {
      return c[0] as DiffLinePrefix;
    }

    return null;
  }

  /**
   * Parses a hunk, including its header or throws an error if the diff doesn't
   * contain a well-formed diff hunk at the current position.
   *
   * Expects that the position has been advanced to the beginning of a presumed
   * diff hunk header.
   *
   * @param linesConsumed The number of unified diff lines consumed up until
   *                      this point by the diff parser. Used to give the
   *                      position and length (in lines) of the parsed hunk
   *                      relative to the overall parsed diff. These numbers
   *                      have no real meaning in the context of a diff and
   *                      are only used to aid the app in line-selections.
   */
  private parseHunk(linesConsumed: number, hunkIndex: number, previousHunk: DiffHunk | null): DiffHunk {
    const headerLine = this.readLine(true);
    if (!headerLine) {
      throw new Error("Expected hunk header but reached end of diff");
    }

    const header = this.parseHunkHeader(headerLine);
    const lines = new Array<DiffLine>();
    lines.push(new DiffLine(headerLine, DiffLineType.Hunk, 1, null, null));

    let c: DiffLinePrefix | null;

    let rollingDiffBeforeCounter = header.oldStartLine;
    let rollingDiffAfterCounter = header.newStartLine;

    let diffLineNumber = linesConsumed;
    while ((c = this.parseLinePrefix(this.peek()))) {
      const line = this.readLine(false);

      if (!line) {
        throw new Error("Expected unified diff line but reached end of diff");
      }

      // A marker indicating that the last line in the original or the new file
      // is missing a trailing newline. In other words, the presence of this marker
      // means that the new and/or original file lacks a trailing newline.
      //
      // When we find it we have to look up the previous line and set the
      // noTrailingNewLine flag
      if (c === DiffPrefixNoNewline) {
        // See https://github.com/git/git/blob/21f862b498925194f8f1ebe8203b7a7df756555b/apply.c#L1725-L1732
        if (line.length < 12) {
          throw new Error(`Expected "no newline at end of file" marker to be at least 12 bytes long`);
        }

        const previousLineIndex = lines.length - 1;
        const previousLine = lines[previousLineIndex];
        lines[previousLineIndex] = previousLine.withNoTrailingNewLine(true);

        continue;
      }

      // We must increase `diffLineNumber` only when we're certain that the line
      // is not a "no newline" marker. Otherwise, we'll end up with a wrong
      // `diffLineNumber` for the next line. This could happen if the last line
      // in the file doesn't have a newline before the change.
      diffLineNumber++;

      let diffLine: DiffLine;

      if (c === DiffPrefixAdd) {
        diffLine = new DiffLine(line, DiffLineType.Add, diffLineNumber, null, rollingDiffAfterCounter++);
      } else if (c === DiffPrefixDelete) {
        diffLine = new DiffLine(line, DiffLineType.Delete, diffLineNumber, rollingDiffBeforeCounter++, null);
      } else if (c === DiffPrefixContext) {
        diffLine = new DiffLine(
          line,
          DiffLineType.Context,
          diffLineNumber,
          rollingDiffBeforeCounter++,
          rollingDiffAfterCounter++
        );
      } else {
        return assertNever(c, `Unknown DiffLinePrefix: ${c}`);
      }

      lines.push(diffLine);
    }

    if (lines.length === 1) {
      throw new Error("Malformed diff, empty hunk");
    }

    return new DiffHunk(
      header,
      lines,
      linesConsumed,
      linesConsumed + lines.length - 1,
      getHunkHeaderExpansionType(hunkIndex, header, previousHunk)
    );
  }

  /**
   * Parse a well-formed unified diff into hunks and lines.
   *
   * @param text A unified diff produced by git diff, git log --patch
   *             or any other git plumbing command that produces unified
   *             diffs.
   */
  public parse(text: string): IRawDiff {
    this.text = text;

    try {
      const headerInfo = this.parseDiffHeader();

      const headerEnd = this.le;
      const header = this.text.substring(0, headerEnd);

      // empty diff
      if (!headerInfo) {
        return {
          header,
          contents: "",
          hunks: [],
          isBinary: false,
          maxLineNumber: 0,
          hasHiddenBidiChars: false,
        };
      }

      if (headerInfo.isBinary) {
        return {
          header,
          contents: "",
          hunks: [],
          isBinary: true,
          maxLineNumber: 0,
          hasHiddenBidiChars: false,
        };
      }

      const hunks = new Array<DiffHunk>();
      let linesConsumed = 0;
      let previousHunk: DiffHunk | null = null;

      do {
        const hunk = this.parseHunk(linesConsumed, hunks.length, previousHunk);
        hunks.push(hunk);
        previousHunk = hunk;
        linesConsumed += hunk.lines.length;
      } while (this.peek());

      const contents = this.text
        .substring(headerEnd + 1, this.le)
        // Note that this simply returns a reference to the
        // substring if no match is found, it does not create
        // a new string instance.
        .replace(/\n\\ No newline at end of file/g, "");

      return {
        header,
        contents,
        hunks,
        isBinary: headerInfo.isBinary,
        maxLineNumber: getLargestLineNumber(hunks),
        hasHiddenBidiChars: HiddenBidiCharsRegex.test(text),
      };
    } finally {
      this.reset();
    }
  }
}

export const parseInstance = new DiffParser();
