import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const extToLang: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  html: "xml",
  htm: "xml",
  xml: "xml",
  css: "css",
  scss: "scss",
  json: "json",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  swift: "swift",
  kt: "kotlin",
  sql: "sql",
};

export function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return extToLang[ext] || "plaintext";
}
