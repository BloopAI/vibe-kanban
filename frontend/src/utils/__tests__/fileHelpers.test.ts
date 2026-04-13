import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isMarkdownFile,
  getClaudeRelativePath,
  getFilePreviewRouting,
  shouldShowViewButton,
} from '../fileHelpers';

describe('isMarkdownFile', () => {
  it('returns true for .md files', () => {
    expect(isMarkdownFile('README.md')).toBe(true);
    expect(isMarkdownFile('docs/file.MD')).toBe(true);
  });

  it('returns true for .mdx files', () => {
    expect(isMarkdownFile('component.mdx')).toBe(true);
    expect(isMarkdownFile('docs/page.MDX')).toBe(true);
  });

  it('returns true for .markdown files', () => {
    expect(isMarkdownFile('notes.markdown')).toBe(true);
  });

  it('returns false for non-markdown files', () => {
    expect(isMarkdownFile('file.ts')).toBe(false);
    expect(isMarkdownFile('readme.txt')).toBe(false);
    expect(isMarkdownFile('script.js')).toBe(false);
  });
});

describe('getClaudeRelativePath', () => {
  it('extracts relative path from .claude/ paths', () => {
    expect(getClaudeRelativePath('.claude/tasks/001.md')).toBe('tasks/001.md');
    expect(getClaudeRelativePath('.claude/plans/foo.md')).toBe('plans/foo.md');
  });

  it('extracts relative path from full paths with .claude/', () => {
    expect(getClaudeRelativePath('/home/user/.claude/plans/foo.md')).toBe(
      'plans/foo.md'
    );
    expect(
      getClaudeRelativePath('/var/tmp/worktree/.claude/tasks/quiet-coalescing-lagoon/001.md')
    ).toBe('tasks/quiet-coalescing-lagoon/001.md');
  });

  it('returns null for non-.claude paths', () => {
    expect(getClaudeRelativePath('src/main.ts')).toBeNull();
    expect(getClaudeRelativePath('/home/user/project/README.md')).toBeNull();
    expect(getClaudeRelativePath('docs/README.md')).toBeNull();
  });

  it('returns null for paths containing claude without dot prefix', () => {
    expect(getClaudeRelativePath('claude/tasks/001.md')).toBeNull();
  });
});

describe('getFilePreviewRouting', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('prioritizes attemptId over claudeRelativePath for .claude/ files', () => {
    const result = getFilePreviewRouting({
      path: '.claude/tasks/001.md',
      attemptId: 'test-attempt-123',
    });
    expect(result).toEqual({
      path: '.claude/tasks/001.md',
      attemptId: 'test-attempt-123',
    });
    // Should NOT have relativePath
    expect(result?.relativePath).toBeUndefined();
  });

  it('uses relativePath for absolute ~/.claude/ paths even when attemptId is present', () => {
    // Absolute paths to ~/.claude/ are home-dir files, not worktree files.
    // attemptId must NOT override routing for absolute paths.
    const result = getFilePreviewRouting({
      path: '/home/user/.claude/plans/starry-stirring-riddle.md',
      attemptId: 'test-attempt-123',
    });
    expect(result).toEqual({
      path: '/home/user/.claude/plans/starry-stirring-riddle.md',
      relativePath: 'plans/starry-stirring-riddle.md',
    });
    expect(result?.attemptId).toBeUndefined();
  });

  it('uses relativePath for .claude/ files when attemptId is not present', () => {
    const result = getFilePreviewRouting({
      path: '.claude/tasks/001.md',
    });
    expect(result).toEqual({
      path: '.claude/tasks/001.md',
      relativePath: 'tasks/001.md',
    });
    // Should NOT have attemptId
    expect(result?.attemptId).toBeUndefined();
  });

  it('uses attemptId for regular markdown files', () => {
    const result = getFilePreviewRouting({
      path: 'docs/README.md',
      attemptId: 'test-attempt-123',
    });
    expect(result).toEqual({
      path: 'docs/README.md',
      attemptId: 'test-attempt-123',
    });
  });

  it('returns null and logs warning for markdown files without routing context', () => {
    const result = getFilePreviewRouting({
      path: 'docs/README.md',
      // No attemptId, no .claude/ path
    });
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unable to route file preview')
    );
  });

  it('returns null for non-viewable files without attemptId', () => {
    const result = getFilePreviewRouting({
      path: 'src/main.ts',
    });
    expect(result).toBeNull();
    // Should not log warning for non-viewable files
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns routing with attemptId for non-viewable files when attemptId is present', () => {
    const result = getFilePreviewRouting({
      path: 'src/main.ts',
      attemptId: 'test-attempt-123',
    });
    expect(result).toEqual({
      path: 'src/main.ts',
      attemptId: 'test-attempt-123',
    });
  });
});

describe('shouldShowViewButton', () => {
  it('returns true for .claude/ paths', () => {
    expect(shouldShowViewButton('.claude/tasks/001.md')).toBe(true);
    expect(shouldShowViewButton('.claude/plans/foo.md')).toBe(true);
    expect(shouldShowViewButton('/home/user/.claude/plans/foo.md')).toBe(true);
  });

  it('returns true for markdown files', () => {
    expect(shouldShowViewButton('docs/README.md')).toBe(true);
    expect(shouldShowViewButton('notes.mdx')).toBe(true);
    expect(shouldShowViewButton('guide.markdown')).toBe(true);
  });

  it('returns false for non-viewable files', () => {
    expect(shouldShowViewButton('src/main.ts')).toBe(false);
    expect(shouldShowViewButton('package.json')).toBe(false);
    expect(shouldShowViewButton('styles.css')).toBe(false);
  });
});
