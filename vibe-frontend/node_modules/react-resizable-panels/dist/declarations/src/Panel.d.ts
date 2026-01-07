import { ForwardedRef, HTMLAttributes, PropsWithChildren, ReactElement } from "react";
export type PanelOnCollapse = () => void;
export type PanelOnExpand = () => void;
export type PanelOnResize = (size: number, prevSize: number | undefined) => void;
export type PanelCallbacks = {
    onCollapse?: PanelOnCollapse;
    onExpand?: PanelOnExpand;
    onResize?: PanelOnResize;
};
export type PanelConstraints = {
    collapsedSize?: number | undefined;
    collapsible?: boolean | undefined;
    defaultSize?: number | undefined;
    maxSize?: number | undefined;
    minSize?: number | undefined;
};
export type PanelData = {
    callbacks: PanelCallbacks;
    constraints: PanelConstraints;
    id: string;
    idIsFromProps: boolean;
    order: number | undefined;
};
export type ImperativePanelHandle = {
    collapse: () => void;
    expand: (minSize?: number) => void;
    getId(): string;
    getSize(): number;
    isCollapsed: () => boolean;
    isExpanded: () => boolean;
    resize: (size: number) => void;
};
export type PanelProps<T extends keyof HTMLElementTagNameMap = keyof HTMLElementTagNameMap> = Omit<HTMLAttributes<HTMLElementTagNameMap[T]>, "id" | "onResize"> & PropsWithChildren<{
    className?: string;
    collapsedSize?: number | undefined;
    collapsible?: boolean | undefined;
    defaultSize?: number | undefined;
    id?: string;
    maxSize?: number | undefined;
    minSize?: number | undefined;
    onCollapse?: PanelOnCollapse;
    onExpand?: PanelOnExpand;
    onResize?: PanelOnResize;
    order?: number;
    style?: object;
    tagName?: T;
}>;
export declare function PanelWithForwardedRef({ children, className: classNameFromProps, collapsedSize, collapsible, defaultSize, forwardedRef, id: idFromProps, maxSize, minSize, onCollapse, onExpand, onResize, order, style: styleFromProps, tagName: Type, ...rest }: PanelProps & {
    forwardedRef: ForwardedRef<ImperativePanelHandle>;
}): ReactElement;
export declare namespace PanelWithForwardedRef {
    var displayName: string;
}
export declare const Panel: import("react").ForwardRefExoticComponent<Omit<HTMLAttributes<HTMLObjectElement | HTMLElement | HTMLAnchorElement | HTMLAreaElement | HTMLAudioElement | HTMLBaseElement | HTMLQuoteElement | HTMLBodyElement | HTMLBRElement | HTMLButtonElement | HTMLCanvasElement | HTMLTableCaptionElement | HTMLTableColElement | HTMLDataElement | HTMLDataListElement | HTMLModElement | HTMLDetailsElement | HTMLDialogElement | HTMLDivElement | HTMLDListElement | HTMLEmbedElement | HTMLFieldSetElement | HTMLFormElement | HTMLHeadingElement | HTMLHeadElement | HTMLHRElement | HTMLHtmlElement | HTMLIFrameElement | HTMLImageElement | HTMLInputElement | HTMLLabelElement | HTMLLegendElement | HTMLLIElement | HTMLLinkElement | HTMLMapElement | HTMLMenuElement | HTMLMetaElement | HTMLMeterElement | HTMLOListElement | HTMLOptGroupElement | HTMLOptionElement | HTMLOutputElement | HTMLParagraphElement | HTMLPictureElement | HTMLPreElement | HTMLProgressElement | HTMLScriptElement | HTMLSelectElement | HTMLSlotElement | HTMLSourceElement | HTMLSpanElement | HTMLStyleElement | HTMLTableElement | HTMLTableSectionElement | HTMLTableCellElement | HTMLTemplateElement | HTMLTextAreaElement | HTMLTimeElement | HTMLTitleElement | HTMLTableRowElement | HTMLTrackElement | HTMLUListElement | HTMLVideoElement>, "id" | "onResize"> & {
    className?: string;
    collapsedSize?: number | undefined;
    collapsible?: boolean | undefined;
    defaultSize?: number | undefined;
    id?: string;
    maxSize?: number | undefined;
    minSize?: number | undefined;
    onCollapse?: PanelOnCollapse;
    onExpand?: PanelOnExpand;
    onResize?: PanelOnResize;
    order?: number;
    style?: object;
    tagName?: keyof HTMLElementTagNameMap | undefined;
} & {
    children?: import("react").ReactNode | undefined;
} & import("react").RefAttributes<ImperativePanelHandle>>;
