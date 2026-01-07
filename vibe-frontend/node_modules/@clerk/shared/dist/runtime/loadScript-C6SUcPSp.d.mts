//#region src/loadScript.d.ts
type LoadScriptOptions = {
  async?: boolean;
  defer?: boolean;
  crossOrigin?: 'anonymous' | 'use-credentials';
  nonce?: string;
  beforeLoad?: (script: HTMLScriptElement) => void;
};
declare function loadScript(src: string | undefined, opts: LoadScriptOptions): Promise<HTMLScriptElement>;
//#endregion
export { loadScript };
//# sourceMappingURL=loadScript-C6SUcPSp.d.mts.map