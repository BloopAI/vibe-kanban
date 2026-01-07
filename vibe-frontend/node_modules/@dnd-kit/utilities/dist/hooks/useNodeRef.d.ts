/// <reference types="react" />
export declare function useNodeRef(onChange?: (newElement: HTMLElement | null, previousElement: HTMLElement | null) => void): readonly [import("react").MutableRefObject<HTMLElement | null>, (element: HTMLElement | null) => void];
