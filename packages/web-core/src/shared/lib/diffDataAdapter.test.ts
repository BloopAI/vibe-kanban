import { describe, it, expect } from 'vitest';
import { transformDiffToFileDiffMetadata } from './diffDataAdapter';
import type { Diff } from 'shared/types';

function createDiffFixture(overrides: Partial<Diff> = {}): Diff {
  return {
    oldPath: 'src/hello.ts',
    newPath: 'src/hello.ts',
    oldContent: 'const a = 1;\nconst b = 2;\n',
    newContent: 'const a = 1;\nconst b = 3;\nconst c = 4;\n',
    change: 'modified',
    contentOmitted: false,
    ...overrides,
  } as Diff;
}

describe('transformDiffToFileDiffMetadata', () => {
  it('produces FileDiffMetadata with expected top-level fields', () => {
    const diff = createDiffFixture();
    const result = transformDiffToFileDiffMetadata(diff);

    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('hunks');
    expect(result).toHaveProperty('splitLineCount');
    expect(result).toHaveProperty('unifiedLineCount');
    expect(result).toHaveProperty('isPartial');
    expect(result).toHaveProperty('deletionLines');
    expect(result).toHaveProperty('additionLines');

    expect(result.type).toBe('change');
    expect(result.name).toBe('src/hello.ts');
    expect(result.prevName).toBeUndefined();
    expect(typeof result.splitLineCount).toBe('number');
    expect(typeof result.unifiedLineCount).toBe('number');
    expect(Array.isArray(result.hunks)).toBe(true);
    expect(Array.isArray(result.deletionLines)).toBe(true);
    expect(Array.isArray(result.additionLines)).toBe(true);
  });

  it('produces correct hunk structure with line index fields', () => {
    const diff = createDiffFixture();
    const result = transformDiffToFileDiffMetadata(diff);

    expect(result.hunks.length).toBeGreaterThan(0);

    const hunk = result.hunks[0];
    expect(hunk).toHaveProperty('collapsedBefore');
    expect(hunk).toHaveProperty('additionStart');
    expect(hunk).toHaveProperty('additionCount');
    expect(hunk).toHaveProperty('additionLines');
    expect(hunk).toHaveProperty('additionLineIndex');
    expect(hunk).toHaveProperty('deletionStart');
    expect(hunk).toHaveProperty('deletionCount');
    expect(hunk).toHaveProperty('deletionLines');
    expect(hunk).toHaveProperty('deletionLineIndex');
    expect(hunk).toHaveProperty('splitLineStart');
    expect(hunk).toHaveProperty('splitLineCount');
    expect(hunk).toHaveProperty('unifiedLineStart');
    expect(hunk).toHaveProperty('unifiedLineCount');
    expect(hunk).toHaveProperty('hunkContent');
    expect(Array.isArray(hunk.hunkContent)).toBe(true);

    for (const content of hunk.hunkContent) {
      if (content.type === 'change') {
        expect(typeof content.additions).toBe('number');
        expect(typeof content.deletions).toBe('number');
      } else {
        expect(typeof content.lines).toBe('number');
      }
    }
  });

  it('handles contentOmitted with placeholder metadata', () => {
    const diff = createDiffFixture({ contentOmitted: true });
    const result = transformDiffToFileDiffMetadata(diff);

    expect(result.name).toBe('src/hello.ts');
    expect(result.type).toBe('change');
    expect(result.hunks).toEqual([]);
    expect(result.splitLineCount).toBe(0);
    expect(result.unifiedLineCount).toBe(0);
  });

  it('handles rename with prevName', () => {
    const diff = createDiffFixture({
      oldPath: 'src/old.ts',
      newPath: 'src/new.ts',
      change: 'renamed',
    });
    const result = transformDiffToFileDiffMetadata(diff);

    expect(result.name).toBe('src/new.ts');
    expect(result.prevName).toBe('src/old.ts');
    expect(result.type).toBe('rename-changed');
  });

  it('handles pure rename (same content)', () => {
    const content = 'const x = 1;\n';
    const diff = createDiffFixture({
      oldPath: 'src/old.ts',
      newPath: 'src/new.ts',
      oldContent: content,
      newContent: content,
      change: 'renamed',
    });
    const result = transformDiffToFileDiffMetadata(diff);

    expect(result.type).toBe('rename-pure');
    expect(result.prevName).toBe('src/old.ts');
  });

  it('snapshot: full output shape for regression detection', () => {
    const diff = createDiffFixture();
    const result = transformDiffToFileDiffMetadata(diff);
    expect(result).toMatchSnapshot();
  });
});
