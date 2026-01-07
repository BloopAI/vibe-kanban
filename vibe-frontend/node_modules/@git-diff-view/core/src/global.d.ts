import { File } from ".";

declare global {
  const __DEV__: boolean;
  const __VERSION__: string;

  export interface globalThis {
    "@git-diff-cache": Map<string, File>[];
  }

  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
    }
  }
}

export {};
