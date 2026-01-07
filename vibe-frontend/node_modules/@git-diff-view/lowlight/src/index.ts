import { createLowlight, all } from "lowlight";

import { processAST, type SyntaxLine } from "./processAST";

import type { _getAST } from "./lang";

const lowlight = createLowlight(all);

// !SEE https://github.com/highlightjs/highlightjs-vue

lowlight.register("vue", function hljsDefineVue(hljs) {
  return {
    subLanguage: "xml",
    contains: [
      hljs.COMMENT("<!--", "-->", {
        relevance: 10,
      }),
      {
        begin: /^(\s*)(<script>)/gm,
        end: /^(\s*)(<\/script>)/gm,
        subLanguage: "javascript",
        excludeBegin: true,
        excludeEnd: true,
      },
      {
        begin: /^(?:\s*)(?:<script\s+lang=(["'])ts\1>)/gm,
        end: /^(\s*)(<\/script>)/gm,
        subLanguage: "typescript",
        excludeBegin: true,
        excludeEnd: true,
      },
      {
        begin: /^(\s*)(<style(\s+scoped)?>)/gm,
        end: /^(\s*)(<\/style>)/gm,
        subLanguage: "css",
        excludeBegin: true,
        excludeEnd: true,
      },
      {
        begin: /^(?:\s*)(?:<style(?:\s+scoped)?\s+lang=(["'])(?:s[ca]ss)\1(?:\s+scoped)?>)/gm,
        end: /^(\s*)(<\/style>)/gm,
        subLanguage: "scss",
        excludeBegin: true,
        excludeEnd: true,
      },
      {
        begin: /^(?:\s*)(?:<style(?:\s+scoped)?\s+lang=(["'])stylus\1(?:\s+scoped)?>)/gm,
        end: /^(\s*)(<\/style>)/gm,
        subLanguage: "stylus",
        excludeBegin: true,
        excludeEnd: true,
      },
    ],
  };
});

export type DiffAST = ReturnType<typeof lowlight.highlight>;

export type DiffHighlighter = {
  name: string;
  type: "class" | "style" | string;
  maxLineToIgnoreSyntax: number;
  setMaxLineToIgnoreSyntax: (v: number) => void;
  ignoreSyntaxHighlightList: (string | RegExp)[];
  setIgnoreSyntaxHighlightList: (v: (string | RegExp)[]) => void;
  getAST: typeof _getAST;
  processAST: (ast: DiffAST) => { syntaxFileObject: Record<number, SyntaxLine>; syntaxFileLineNumber: number };
  hasRegisteredCurrentLang: (lang: string) => boolean;
  getHighlighterEngine: () => typeof lowlight;
};

const instance = { name: "lowlight" };

let _maxLineToIgnoreSyntax = 2000;

const _ignoreSyntaxHighlightList: (string | RegExp)[] = [];

Object.defineProperty(instance, "maxLineToIgnoreSyntax", {
  get: () => _maxLineToIgnoreSyntax,
});

Object.defineProperty(instance, "setMaxLineToIgnoreSyntax", {
  value: (v: number) => {
    _maxLineToIgnoreSyntax = v;
  },
});

Object.defineProperty(instance, "ignoreSyntaxHighlightList", {
  get: () => _ignoreSyntaxHighlightList,
});

Object.defineProperty(instance, "setIgnoreSyntaxHighlightList", {
  value: (v: (string | RegExp)[]) => {
    _ignoreSyntaxHighlightList.length = 0;
    _ignoreSyntaxHighlightList.push(...v);
  },
});

Object.defineProperty(instance, "getAST", {
  value: (raw: string, fileName?: string, lang?: string) => {
    let hasRegisteredLang = true;

    if (!lowlight.registered(lang)) {
      if (__DEV__) {
        console.warn(`not support current lang: ${lang} yet`);
      }
      hasRegisteredLang = false;
    }

    if (
      fileName &&
      highlighter.ignoreSyntaxHighlightList.some((item) =>
        item instanceof RegExp ? item.test(fileName) : fileName === item
      )
    ) {
      if (__DEV__) {
        console.warn(
          `ignore syntax for current file, because the fileName is in the ignoreSyntaxHighlightList: ${fileName}`
        );
      }
      return;
    }

    if (hasRegisteredLang) {
      return lowlight.highlight(lang, raw);
    } else {
      return lowlight.highlightAuto(raw);
    }
  },
});

Object.defineProperty(instance, "processAST", {
  value: (ast: DiffAST) => {
    return processAST(ast);
  },
});

Object.defineProperty(instance, "hasRegisteredCurrentLang", {
  value: (lang: string) => {
    return lowlight.registered(lang);
  },
});

Object.defineProperty(instance, "getHighlighterEngine", {
  value: () => lowlight,
});

Object.defineProperty(instance, "type", { value: "class" });

export { processAST } from "./processAST";

export const versions = __VERSION__;

export const highlighter: DiffHighlighter = instance as DiffHighlighter;

export * from "./lang";
