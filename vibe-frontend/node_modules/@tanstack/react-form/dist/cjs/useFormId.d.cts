import { useUUID } from './useUUID.cjs';
/** React 17 does not have the useId hook, so we use a random uuid as a fallback. */
export declare const useFormId: typeof useUUID;
