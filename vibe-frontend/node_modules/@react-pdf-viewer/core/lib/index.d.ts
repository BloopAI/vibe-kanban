/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2023 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import * as React from 'react';

// Types
export interface Offset {
    left: number;
    top: number;
}
export interface OpenFile {
    data: PdfJs.FileData;
    name: string;
}
export interface Rect {
    height: number;
    width: number;
}
export interface PageLayout {
    buildPageStyles?: ({
        numPages,
        pageIndex,
        scrollMode,
        viewMode,
    }: {
        numPages: number;
        pageIndex: number;
        scrollMode: ScrollMode;
        viewMode: ViewMode;
    }) => React.CSSProperties;
    transformSize?: ({ numPages, pageIndex, size }: { numPages: number; pageIndex: number; size: Rect }) => Rect;
}
export interface PageSize {
    pageHeight: number;
    pageWidth: number;
    rotation: number;
}
export interface Plugin {
    install?(pluginFunctions: PluginFunctions): void;
    renderPageLayer?(props: PluginRenderPageLayer): React.ReactElement;
    renderViewer?(props: RenderViewer): Slot;
    uninstall?(pluginFunctions: PluginFunctions): void;
    onAnnotationLayerRender?(props: PluginOnAnnotationLayerRender): void;
    onCanvasLayerRender?(props: PluginOnCanvasLayerRender): void;
    onDocumentLoad?(props: PluginOnDocumentLoad): void;
    onTextLayerRender?(props: PluginOnTextLayerRender): void;
    onViewerStateChange?(viewerState: ViewerState): ViewerState;
}

export type DestinationOffsetFromViewport = (viewportWidth: number, viewportHeight: number) => number;

export interface Destination {
    bottomOffset: number | DestinationOffsetFromViewport;
    label?: string;
    leftOffset: number | DestinationOffsetFromViewport;
    pageIndex: number;
    scaleTo?: number | SpecialZoomLevel;
}

export interface PluginFunctions {
    enterFullScreenMode(target: HTMLElement): void;
    exitFullScreenMode(): void;
    getPagesContainer(): HTMLElement;
    getViewerState(): ViewerState;
    jumpToDestination(destination: Destination): Promise<void>;
    jumpToNextDestination(): Promise<void>;
    jumpToPreviousDestination(): Promise<void>;
    jumpToNextPage(): Promise<void>;
    jumpToPreviousPage(): Promise<void>;
    jumpToPage(pageIndex: number): Promise<void>;
    openFile(file: File): void;
    rotate(direction: RotateDirection): void;
    rotatePage(pageIndex: number, direction: RotateDirection): void;
    setViewerState(viewerState: ViewerState): void;
    switchScrollMode(scrollMode: ScrollMode): void;
    switchViewMode(viewMode: ViewMode): void;
    zoom(scale: number | SpecialZoomLevel): void;
}
export interface PluginOnDocumentLoad {
    doc: PdfJs.PdfDocument;
    file: OpenFile;
}
export interface PluginOnTextLayerRender {
    ele: HTMLElement;
    pageIndex: number;
    scale: number;
    status: LayerRenderStatus;
}
export interface PluginOnAnnotationLayerRender {
    annotations: PdfJs.Annotation[];
    container: HTMLElement;
    pageIndex: number;
    scale: number;
    rotation: number;
}
// Invoked when the canvas layer is rendered
export interface PluginOnCanvasLayerRender {
    ele: HTMLCanvasElement;
    pageIndex: number;
    rotation: number;
    scale: number;
    status: LayerRenderStatus;
}
export interface PluginRenderPageLayer {
    canvasLayerRef: React.MutableRefObject<HTMLCanvasElement>;
    // Is the canvas layer rendered completely?
    canvasLayerRendered: boolean;
    doc: PdfJs.PdfDocument;
    height: number;
    pageIndex: number;
    rotation: number;
    scale: number;
    textLayerRef: React.MutableRefObject<HTMLDivElement>;
    // Is the text layer rendered completely?
    textLayerRendered: boolean;
    width: number;
}
export interface RenderPageProps {
    annotationLayer: Slot;
    canvasLayer: Slot;
    // Is the canvas layer rendered completely?
    canvasLayerRendered: boolean;
    doc: PdfJs.PdfDocument;
    height: number;
    pageIndex: number;
    rotation: number;
    scale: number;
    svgLayer: Slot;
    textLayer: Slot;
    // Is the text layer rendered completely?
    textLayerRendered: boolean;
    width: number;
    // Mark as the page rendered completely
    markRendered(pageIndex: number): void;
    onRotatePage(direction: RotateDirection): void;
}
export type RenderPage = (props: RenderPageProps) => React.ReactElement;
export interface RenderViewer {
    containerRef: React.RefObject<HTMLDivElement>;
    doc: PdfJs.PdfDocument;
    pagesContainerRef: React.RefObject<HTMLDivElement>;
    // The rotation for each page
    pagesRotation: Map<number, number>;
    pageSizes: PageSize[];
    rotation: number;
    slot: Slot;
    themeContext: ThemeContextProps;
    openFile(file: File): void;
    // Jump to given page
    // `page` is zero-index based
    jumpToPage(page: number): void;
    rotate(direction: RotateDirection): void;
    rotatePage(pageIndex: number, direction: RotateDirection): void;
    switchScrollMode(scrollMode: ScrollMode): void;
    switchViewMode(viewMode: ViewMode): void;
    zoom(level: number | SpecialZoomLevel): void;
}
export interface Slot {
    attrs?: SlotAttr;
    children?: React.ReactNode;
    subSlot?: Slot;
}
export interface SlotAttr extends React.HTMLAttributes<HTMLDivElement> {
    'data-testid'?: string;
    ref?: React.MutableRefObject<HTMLDivElement | null>;
}
export type Toggle = (status?: ToggleStatus) => void;
export interface ViewerState {
    // The current opened file. It can be changed from outside, such as user drags and drops an external file
    // or user opens a file from toolbar
    file: OpenFile;
    fullScreenMode: FullScreenMode;
    // The current page index
    pageIndex: number;
    // Size of page
    pageHeight: number;
    pageWidth: number;
    // The rotation for each page
    pagesRotation: Map<number, number>;
    // The last page which is rotated
    rotatedPage?: number;
    rotation: number;
    // The current zoom level
    scale: number;
    // The current scroll mode
    scrollMode: ScrollMode;
    // The current view mode
    viewMode: ViewMode;
}
export interface VisibilityChanged {
    isVisible: boolean;
    ratio: number;
}

// Structs
export enum AnnotationType {
    Text = 1,
    Link = 2,
    FreeText = 3,
    Line = 4,
    Square = 5,
    Circle = 6,
    Polygon = 7,
    Polyline = 8,
    Highlight = 9,
    Underline = 10,
    Squiggly = 11,
    StrikeOut = 12,
    Stamp = 13,
    Caret = 14,
    Ink = 15,
    Popup = 16,
    FileAttachment = 17,
}

export enum FullScreenMode {
    Normal = 'Normal',
    // Start entering the full screen mode
    Entering = 'Entering',
    Entered = 'Entered',
    Exitting = 'Exitting',
    Exited = 'Exited',
}

export enum LayerRenderStatus {
    PreRender,
    DidRender,
}

export enum PageMode {
    Attachments = 'UseAttachments',
    Bookmarks = 'UseOutlines',
    ContentGroup = 'UseOC',
    Default = 'UserNone',
    FullScreen = 'FullScreen',
    Thumbnails = 'UseThumbs',
}

export enum Position {
    TopLeft = 'TOP_LEFT',
    TopCenter = 'TOP_CENTER',
    TopRight = 'TOP_RIGHT',
    RightTop = 'RIGHT_TOP',
    RightCenter = 'RIGHT_CENTER',
    RightBottom = 'RIGHT_BOTTOM',
    BottomLeft = 'BOTTOM_LEFT',
    BottomCenter = 'BOTTOM_CENTER',
    BottomRight = 'BOTTOM_RIGHT',
    LeftTop = 'LEFT_TOP',
    LeftCenter = 'LEFT_CENTER',
    LeftBottom = 'LEFT_BOTTOM',
}

export enum RotateDirection {
    Backward = 'Backward',
    Forward = 'Forward',
}

export enum ScrollMode {
    Page = 'Page',
    Horizontal = 'Horizontal',
    Vertical = 'Vertical',
    Wrapped = 'Wrapped',
}

export enum SpecialZoomLevel {
    ActualSize = 'ActualSize',
    PageFit = 'PageFit',
    PageWidth = 'PageWidth',
}

export enum ViewMode {
    DualPage = 'DualPage',
    DualPageWithCover = 'DualPageWithCover',
    SinglePage = 'SinglePage',
}

export enum ToggleStatus {
    Close = 'Close',
    Open = 'Open',
    Toggle = 'Toggle',
}

// Components
export type RenderContent = (toggle: Toggle) => React.ReactNode;
export type RenderTarget = (toggle: Toggle, opened: boolean) => React.ReactNode;

export interface ButtonProps {
    children?: React.ReactNode;
    testId?: string;
    onClick(): void;
}
export class Button extends React.Component<ButtonProps> {}

export interface LazyRenderProps {
    attrs?: React.HTMLAttributes<HTMLDivElement>;
    children?: React.ReactNode;
    testId?: string;
}
export class LazyRender extends React.Component<LazyRenderProps> {}

export class Menu extends React.Component<{
    children?: React.ReactNode;
}> {}

export class MenuDivider extends React.Component {}

export interface MenuItemProps {
    checked?: boolean;
    children?: React.ReactNode;
    icon?: React.ReactElement;
    isDisabled?: boolean;
    testId?: string;
    onClick(): void;
}
export class MenuItem extends React.Component<MenuItemProps> {}

export interface MinimalButtonProps {
    ariaLabel?: string;
    ariaKeyShortcuts?: string;
    children?: React.ReactNode;
    isDisabled?: boolean;
    isSelected?: boolean;
    testId?: string;
    onClick(): void;
}
export class MinimalButton extends React.Component<MinimalButtonProps> {}

export interface PrimaryButtonProps {
    children?: React.ReactNode;
    testId?: string;
    onClick(): void;
}
export class PrimaryButton extends React.Component<PrimaryButtonProps> {}

export interface ProgressBarProps {
    progress: number;
}
export class ProgressBar extends React.Component<ProgressBarProps> {}

export class Separator extends React.Component {}

export interface SpinnerProps {
    size?: string;
    testId?: string;
}
export class Spinner extends React.Component<SpinnerProps> {}

export interface SplitterSize {
    firstHalfPercentage: number;
    firstHalfSize: number;
    secondHalfPercentage: number;
    secondHalfSize: number;
}
export interface SplitterProps {
    constrain?(size: SplitterSize): boolean;
}
export class Splitter extends React.Component<SplitterProps> {}

export interface TextBoxProps {
    ariaLabel?: string;
    autoFocus?: boolean;
    placeholder?: string;
    testId?: string;
    type?: 'text' | 'password';
    value?: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}
export class TextBox extends React.Component<TextBoxProps> {}

export interface IconProps {
    children?: React.ReactNode;
    // If this option is `true`, the icon will not be flipped
    ignoreDirection?: boolean;
    size?: number;
}
export class Icon extends React.Component<IconProps> {}

export interface ModalProps {
    ariaControlsSuffix?: string;
    closeOnClickOutside: boolean;
    closeOnEscape: boolean;
    content: RenderContent;
    isOpened?: boolean;
    target?: RenderTarget;
}
export class Modal extends React.Component<ModalProps> {}

export interface PopoverProps {
    ariaControlsSuffix?: string;
    ariaHasPopup?: 'dialog' | 'menu';
    closeOnClickOutside: boolean;
    closeOnEscape: boolean;
    content: RenderContent;
    lockScroll?: boolean;
    offset: Offset;
    position: Position;
    target?: RenderTarget;
}
export class Popover extends React.Component<PopoverProps> {}

export type RenderTooltipContent = () => React.ReactNode;
export interface TooltipProps {
    ariaControlsSuffix?: string;
    content: RenderTooltipContent;
    offset: Offset;
    position: Position;
    target: React.ReactElement;
}
export class Tooltip extends React.Component<TooltipProps> {}

// Store
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StoreState = Record<string, any>;
export type StoreKey<T extends StoreState> = string & keyof T;
export type StoreHandler<T> = (params: T) => void;

export interface Store<T extends StoreState> {
    subscribe<K extends StoreKey<T>>(eventName: K, handler: StoreHandler<NonNullable<T[K]>>): void;
    unsubscribe<K extends StoreKey<T>>(eventName: K, handler: StoreHandler<NonNullable<T[K]>>): void;
    update<K extends StoreKey<T>>(eventName: K, params: T[K]): void;
    updateCurrentValue<K extends StoreKey<T>>(eventName: K, updater: (currentValue: T[K]) => T[K]): void;
    get<K extends StoreKey<T>>(eventName: K): T[K] | undefined;
}

export function createStore<T extends StoreState>(initialState?: T): Store<T>;

// Contexts
export interface LocalizationMap {
    [key: string]: string | LocalizationMap;
}
export interface LocalizationContextProps {
    l10n: LocalizationMap;
    setL10n(l10n: LocalizationMap): void;
}
export const LocalizationContext: React.Context<LocalizationContextProps>;

export enum TextDirection {
    RightToLeft = 'RTL',
    LeftToRight = 'LTR',
}
export interface ThemeContextProps {
    currentTheme: string;
    direction?: TextDirection;
    setCurrentTheme: (theme: string) => void;
}
export const ThemeContext: React.Context<ThemeContextProps>;

// Viewer
// The character maps that can be downloaded from
// https://github.com/mozilla/pdfjs-dist/tree/master/cmaps
export interface CharacterMap {
    isCompressed: boolean;
    url: string;
}

// Represents the error in case the document can't be loaded
export interface LoadError {
    message?: string;
    // Some possible values for `name` are
    // - AbortException
    // - FormatError
    // - InvalidPDFException
    // - MissingPDFException
    // - PasswordException
    // - UnexpectedResponseException
    // - UnknownErrorException
    name?: string;
}
export type RenderError = (error: LoadError) => React.ReactElement;

// Invoked when the document asks for password
export interface DocumentAskPasswordEvent {
    verifyPassword: (password: string) => void;
}

// Customize the view of protected document
export enum PasswordStatus {
    RequiredPassword = 'RequiredPassword',
    WrongPassword = 'WrongPassword',
}
export interface RenderProtectedViewProps {
    passwordStatus: PasswordStatus;
    verifyPassword: (password: string) => void;
}
export type RenderProtectedView = (renderProps: RenderProtectedViewProps) => React.ReactElement;

// Invoked when the document is loaded successfully
export interface DocumentLoadEvent {
    doc: PdfJs.PdfDocument;
    file: OpenFile;
}

// Invoked when users change the current page
export interface PageChangeEvent {
    // zero-based page index
    currentPage: number;
    doc: PdfJs.PdfDocument;
}

// Invoked when users zoom the document
export interface ZoomEvent {
    doc: PdfJs.PdfDocument;
    scale: number;
}

// Invoked when users rotate the document
export interface RotateEvent {
    direction: RotateDirection;
    doc: PdfJs.PdfDocument;
    rotation: number;
}

// Invoked when users rotate a page of the document
export interface RotatePageEvent {
    direction: RotateDirection;
    doc: PdfJs.PdfDocument;
    pageIndex: number;
    rotation: number;
}

export interface ThemeProps {
    direction?: TextDirection;
    theme?: string;
}

export interface VisiblePagesRange {
    endPage: number;
    numPages: number;
    startPage: number;
}

export type SetRenderRange = (visiblePagesRange: VisiblePagesRange) => { endPage: number; startPage: number };

export interface ViewerProps {
    characterMap?: CharacterMap;
    // The default zoom level
    // If it's not set, the initial zoom level will be calculated based on the dimesion of page and the container width
    // So that, the document will fit best within the container
    defaultScale?: number | SpecialZoomLevel;
    // Enable smooth scroll
    enableSmoothScroll?: boolean;
    fileUrl: string | Uint8Array;
    // Additional authentication headers
    httpHeaders?: Record<string, string | string[]>;
    // The page (zero-index based) that will be displayed initially
    initialPage?: number;
    // The initial rotation, must be divisible by 90
    initialRotation?: number;
    pageLayout?: PageLayout;
    // Plugins
    plugins?: Plugin[];
    localization?: LocalizationMap;
    renderError?: RenderError;
    renderLoader?(percentages: number): React.ReactElement;
    renderPage?: RenderPage;
    renderProtectedView?: RenderProtectedView;
    scrollMode?: ScrollMode;
    setRenderRange?: SetRenderRange;
    // Theme
    theme?: string | ThemeProps;
    transformGetDocumentParams?(options: PdfJs.GetDocumentParams): PdfJs.GetDocumentParams;
    viewMode?: ViewMode;
    // Indicate the cross-site requests should be made with credentials such as cookie and authorization headers.
    // The default value is `false`
    withCredentials?: boolean;
    onDocumentAskPassword?(e: DocumentAskPasswordEvent): void;
    onDocumentLoad?(e: DocumentLoadEvent): void;
    onPageChange?(e: PageChangeEvent): void;
    onRotate?(e: RotateEvent): void;
    onRotatePage?(e: RotatePageEvent): void;
    // Invoked after switching to `theme`
    onSwitchTheme?(theme: string): void;
    onZoom?(e: ZoomEvent): void;
}
export class Viewer extends React.Component<ViewerProps> {}

export interface WorkerProps {
    children?: React.ReactNode;
    workerUrl: string;
}
export class Worker extends React.Component<WorkerProps> {}

// Hooks
export function useDebounceCallback<T extends unknown[]>(callback: (...args: T) => void, wait: number): void;

export interface UseIntersectionObserverProps {
    once?: boolean;
    threshold?: number | number[];
    onVisibilityChanged(params: VisibilityChanged): void;
}
export function useIntersectionObserver(props: UseIntersectionObserverProps): React.MutableRefObject<HTMLDivElement>;

export function useIsomorphicLayoutEffect(effect: React.EffectCallback, deps?: React.DependencyList): void;

export function useIsMounted(): React.MutableRefObject<boolean>;

export function usePrevious<T>(value: T): T;

export interface UseRenderQueue {
    getHighestPriorityPage: () => number;
    isInRange: (pageIndex: number) => boolean;
    markNotRendered: () => void;
    markRendered: (pageIndex: number) => void;
    markRendering: (pageIndex: number) => void;
    setOutOfRange: (pageIndex: number) => void;
    setRange: (startIndex: number, endIndex: number) => void;
    setVisibility: (pageIndex: number, visibility: number) => void;
}

export function useRenderQueue({ doc }: { doc: PdfJs.PdfDocument }): UseRenderQueue;

// Utils
export function chunk<T>(arr: T[], size: number): T[][];

export function classNames(classes: { [clazz: string]: boolean }): string;

export function getPage(doc: PdfJs.PdfDocument, pageIndex: number): Promise<PdfJs.Page>;

export interface JumpToDestination {
    bottomOffset: number;
    leftOffset: number;
    pageIndex: number;
    scaleTo: number | SpecialZoomLevel;
}
export function getDestination(doc: PdfJs.PdfDocument, dest: PdfJs.OutlineDestinationType): Promise<JumpToDestination>;

export function isFullScreenEnabled(): boolean;

export function isMac(): boolean;

// Vendors
// pdfjs namespace
export declare namespace PdfJs {
    type FileData = string | Uint8Array;

    // Worker
    interface PDFWorkerConstructorParams {
        name: string;
    }

    class PDFWorker {
        destroyed: boolean;
        constructor(params: PDFWorkerConstructorParams);
        destroy(): void;
    }

    // Document
    interface PdfDocument {
        numPages: number;
        getAttachments(): Promise<{ [filename: string]: Attachment }>;
        getData(): Promise<Uint8Array>;
        getDestination(dest: string): Promise<OutlineDestination>;
        getDownloadInfo(): Promise<{ length: number }>;
        getMetadata(): Promise<MetaData>;
        getOutline(): Promise<Outline[]>;
        getPage(pageIndex: number): Promise<Page>;
        getPageIndex(ref: OutlineRef): Promise<number>;
        getPageLabels(): Promise<string[] | null>;
        getPageMode(): Promise<PageMode>;
    }
    interface GetDocumentParams {
        data?: FileData;
        cMapUrl?: string;
        cMapPacked?: boolean;
        httpHeaders?: Record<string, string | string[]>;
        url?: string;
        withCredentials?: boolean;
        worker?: PDFWorker;
    }

    // Viewport
    interface ViewPortParams {
        rotation?: number;
        scale: number;
    }
    interface ViewPortCloneParams {
        dontFlip: boolean;
    }
    interface ViewPort {
        height: number;
        rotation: number;
        transform: number[];
        width: number;
        clone(params: ViewPortCloneParams): ViewPort;
        convertToViewportPoint(x: number, y: number): [number, number];
    }

    interface PageTextContent {
        items: PageTextItem[];
    }
    interface PageTextItem {
        str: string;
    }

    // Render task
    interface PageRenderTask {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        promise: Promise<any>;
        cancel(): void;
    }

    // Render page
    interface PageRenderParams {
        canvasContext: CanvasRenderingContext2D;
        // Should be 'print' when printing
        intent?: string;
        transform?: number[];
        viewport: ViewPort;
    }
    interface Page {
        getTextContent(): Promise<PageTextContent>;
        getViewport(params: ViewPortParams): ViewPort;
        render(params: PageRenderParams): PageRenderTask;
    }

    // Attachment
    interface Attachment {
        content: Uint8Array;
        filename: string;
    }

    // Metadata
    interface MetaData {
        contentDispositionFilename?: string;
        info: MetaDataInfo;
    }
    interface MetaDataInfo {
        Author: string;
        CreationDate: string;
        Creator: string;
        Keywords: string;
        ModDate: string;
        PDFFormatVersion: string;
        Producer: string;
        Subject: string;
        Title: string;
    }

    // Outline
    type OutlineDestinationType = string | OutlineDestination;
    interface Outline {
        bold?: boolean;
        color?: number[];
        count?: undefined | number;
        dest?: OutlineDestinationType;
        italic?: boolean;
        items: Outline[];
        newWindow?: boolean;
        title: string;
        unsafeUrl?: string;
        url?: string;
    }
    type OutlineDestination = [
        // The first item is used to indicate the destination page
        OutlineRef | number,
        OutlineDestinationName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...any[]
    ];
    interface OutlineDestinationName {
        name: string; // Can be 'WYZ', 'Fit', ...
    }
    interface OutlineRef {
        gen: number;
        num: number;
    }

    interface AnnotationPoint {
        x: number;
        y: number;
    }
    interface Annotation {
        annotationType: number;
        color?: Uint8ClampedArray;
        dest: OutlineDestinationType;
        hasAppearance: boolean;
        id: string;
        rect: number[];
        subtype: string;
        // Border style
        borderStyle: {
            dashArray: number[];
            horizontalCornerRadius: number;
            style: number;
            verticalCornerRadius: number;
            width: number;
        };
        // For annotation that has a popup
        hasPopup?: boolean;
        contents?: string;
        contentsObj?: {
            dir: string;
            str: string;
        };
        modificationDate?: string;
        quadPoints?: AnnotationPoint[][];
        title?: string;
        titleObj?: {
            dir: string;
            str: string;
        };
        // Parent annotation
        parentId?: string;
        parentType?: string;
        // File attachment annotation
        file?: Attachment;
        // Ink annotation
        inkLists?: AnnotationPoint[][];
        // Line annotation
        lineCoordinates: number[];
        // Link annotation
        // `action` can be `FirstPage`, `PrevPage`, `NextPage`, `LastPage`, `GoBack`, `GoForward`
        action?: string;
        unsafeUrl?: string;
        url?: string;
        newWindow?: boolean;
        // Polyline annotation
        vertices?: AnnotationPoint[];
        // Text annotation
        name?: string;
    }
}
