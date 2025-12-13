import { useMemo, useState } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import ruby from "highlight.js/lib/languages/ruby";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import type { CodeFragment } from "../types/review";

// Register languages
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("kotlin", kotlin);

// Aliases
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("rb", ruby);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("htm", xml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("kt", kotlin);

const extToLang: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  css: "css",
  json: "json",
  html: "xml",
  htm: "xml",
  xml: "xml",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  cpp: "cpp",
  cc: "cpp",
  c: "cpp",
  h: "cpp",
  cs: "csharp",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
};

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return extToLang[ext] || "plaintext";
}

type ViewMode = "fragment" | "file";

interface CodeFragmentCardProps {
  fragment: CodeFragment;
  fileContent?: string;
  isLoading?: boolean;
  unchangedRegion?: boolean;
  hideHeader?: boolean;
}

export function CodeFragmentCard({
  fragment,
  fileContent,
  isLoading,
  unchangedRegion,
  hideHeader,
}: CodeFragmentCardProps) {
  const { file, start_line, end_line, message } = fragment;
  const [viewMode, setViewMode] = useState<ViewMode>("fragment");
  const lang = getLanguageFromPath(file);

  const highlightedLines = useMemo(() => {
    if (!fileContent) return null;

    if (viewMode === "fragment") {
      return getHighlightedLines(fileContent, start_line, end_line, lang);
    } else {
      // Full file view
      const allLines = fileContent.split(/\r?\n/);
      return getHighlightedLines(fileContent, 1, allLines.length, lang);
    }
  }, [fileContent, start_line, end_line, lang, viewMode]);

  const isInFragment = (lineNumber: number) =>
    lineNumber >= start_line && lineNumber <= end_line;

  return (
    <div
      className={hideHeader ? "" : "border rounded bg-muted/40 overflow-hidden"}
    >
      {/* Header */}
      {!hideHeader && (
        <div className="px-3 py-2 border-b bg-muted/60">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <span className="font-mono truncate">{file}</span>
              <span className="shrink-0">
                Lines {start_line}
                {end_line !== start_line && `–${end_line}`}
              </span>
              {unchangedRegion && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                  Unchanged
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {fileContent && (
                <button
                  className="h-6 px-2 rounded hover:bg-muted transition-colors flex items-center justify-center"
                  onClick={() =>
                    setViewMode((prev) =>
                      prev === "fragment" ? "file" : "fragment",
                    )
                  }
                  title={
                    viewMode === "fragment"
                      ? "View full file"
                      : "View fragment only"
                  }
                >
                  {viewMode === "fragment" ? (
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                      />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>
          {message && (
            <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1.5 italic">
              <svg
                className="h-3.5 w-3.5 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                />
              </svg>
              <span>{message}</span>
            </div>
          )}
        </div>
      )}

      {/* Code Content */}
      {isLoading ? (
        <div className="px-3 py-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground/60"></div>
          <span className="ml-2 text-xs text-muted-foreground">Loading...</span>
        </div>
      ) : highlightedLines ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <tbody>
              {highlightedLines.map(({ lineNumber, html }) => (
                <tr
                  key={lineNumber}
                  className={`hover:bg-muted/50 leading-5 ${
                    viewMode === "file" && isInFragment(lineNumber)
                      ? "bg-amber-500/10"
                      : ""
                  }`}
                >
                  <td className="select-none px-3 py-0 text-right text-muted-foreground/60 border-r w-[1%] min-w-[40px] align-top">
                    {lineNumber}
                  </td>
                  <td
                    className="px-3 py-0 whitespace-pre"
                    dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          File content unavailable for this fragment.
        </div>
      )}
    </div>
  );
}

function getHighlightedLines(
  content: string,
  startLine: number,
  endLine: number,
  lang: string,
): { lineNumber: number; html: string }[] {
  const allLines = content.split(/\r?\n/);
  const s = Math.max(1, startLine);
  const e = Math.min(allLines.length, endLine);
  const result: { lineNumber: number; html: string }[] = [];

  for (let i = s; i <= e; i++) {
    const line = allLines[i - 1] || "";
    let html: string;

    try {
      if (lang !== "plaintext" && hljs.getLanguage(lang)) {
        html = hljs.highlight(line, {
          language: lang,
          ignoreIllegals: true,
        }).value;
      } else {
        html = escapeHtml(line);
      }
    } catch {
      html = escapeHtml(line);
    }

    result.push({ lineNumber: i, html });
  }

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
