/** @implements {IPDFStream} */
export class PDFNetworkStream implements IPDFStream {
    constructor(source: any);
    _source: any;
    _manager: NetworkManager;
    _rangeChunkSize: any;
    _fullRequestReader: PDFNetworkStreamFullRequestReader | null;
    _rangeRequestReaders: any[];
    _onRangeRequestReaderClosed(reader: any): void;
    getFullReader(): PDFNetworkStreamFullRequestReader;
    getRangeReader(begin: any, end: any): PDFNetworkStreamRangeRequestReader;
    cancelAllRequests(reason: any): void;
}
declare class NetworkManager {
    constructor(url: any, args?: {});
    url: any;
    isHttp: boolean;
    httpHeaders: any;
    withCredentials: any;
    getXhr: any;
    currXhrId: number;
    pendingRequests: any;
    requestRange(begin: any, end: any, listeners: any): number;
    requestFull(listeners: any): number;
    request(args: any): number;
    onProgress(xhrId: any, evt: any): void;
    onStateChange(xhrId: any, evt: any): void;
    getRequestXhr(xhrId: any): any;
    isPendingRequest(xhrId: any): boolean;
    abortRequest(xhrId: any): void;
}
/** @implements {IPDFStreamReader} */
declare class PDFNetworkStreamFullRequestReader implements IPDFStreamReader {
    constructor(manager: any, source: any);
    _manager: any;
    _url: any;
    _fullRequestId: any;
    _headersReceivedCapability: import("../shared/util.js").PromiseCapability;
    _disableRange: any;
    _contentLength: any;
    _rangeChunkSize: any;
    _isStreamingSupported: boolean;
    _isRangeSupported: boolean;
    _cachedChunks: any[];
    _requests: any[];
    _done: boolean;
    _storedError: import("../shared/util.js").MissingPDFException | import("../shared/util.js").UnexpectedResponseException | undefined;
    _filename: string | null;
    onProgress: any;
    _onHeadersReceived(): void;
    _onDone(data: any): void;
    _onError(status: any): void;
    _onProgress(evt: any): void;
    get filename(): string | null;
    get isRangeSupported(): boolean;
    get isStreamingSupported(): boolean;
    get contentLength(): any;
    get headersReady(): Promise<any>;
    read(): Promise<any>;
    cancel(reason: any): void;
    _fullRequestReader: any;
}
/** @implements {IPDFStreamRangeReader} */
declare class PDFNetworkStreamRangeRequestReader implements IPDFStreamRangeReader {
    constructor(manager: any, begin: any, end: any);
    _manager: any;
    _url: any;
    _requestId: any;
    _requests: any[];
    _queuedChunk: any;
    _done: boolean;
    _storedError: import("../shared/util.js").MissingPDFException | import("../shared/util.js").UnexpectedResponseException | undefined;
    onProgress: any;
    onClosed: any;
    _close(): void;
    _onDone(data: any): void;
    _onError(status: any): void;
    _onProgress(evt: any): void;
    get isStreamingSupported(): boolean;
    read(): Promise<any>;
    cancel(reason: any): void;
}
export {};
