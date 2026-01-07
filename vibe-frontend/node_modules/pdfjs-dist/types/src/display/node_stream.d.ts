export class PDFNodeStream {
    constructor(source: any);
    source: any;
    url: any;
    isHttp: boolean;
    isFsUrl: boolean;
    httpHeaders: any;
    _fullRequestReader: PDFNodeStreamFsFullReader | PDFNodeStreamFullReader | null;
    _rangeRequestReaders: any[];
    get _progressiveDataLength(): number;
    getFullReader(): PDFNodeStreamFsFullReader | PDFNodeStreamFullReader;
    getRangeReader(start: any, end: any): PDFNodeStreamFsRangeReader | PDFNodeStreamRangeReader | null;
    cancelAllRequests(reason: any): void;
}
declare class PDFNodeStreamFsFullReader extends BaseFullReader {
}
declare class PDFNodeStreamFullReader extends BaseFullReader {
    _request: any;
}
declare class PDFNodeStreamFsRangeReader extends BaseRangeReader {
    constructor(stream: any, start: any, end: any);
}
declare class PDFNodeStreamRangeReader extends BaseRangeReader {
    constructor(stream: any, start: any, end: any);
    _httpHeaders: {};
    _request: any;
}
declare class BaseFullReader {
    constructor(stream: any);
    _url: any;
    _done: boolean;
    _storedError: any;
    onProgress: any;
    _contentLength: any;
    _loaded: number;
    _filename: any;
    _disableRange: any;
    _rangeChunkSize: any;
    _isStreamingSupported: boolean;
    _isRangeSupported: boolean;
    _readableStream: any;
    _readCapability: import("../shared/util.js").PromiseCapability;
    _headersCapability: import("../shared/util.js").PromiseCapability;
    get headersReady(): Promise<any>;
    get filename(): any;
    get contentLength(): any;
    get isRangeSupported(): boolean;
    get isStreamingSupported(): boolean;
    read(): any;
    cancel(reason: any): void;
    _error(reason: any): void;
    _setReadableStream(readableStream: any): void;
}
declare class BaseRangeReader {
    constructor(stream: any);
    _url: any;
    _done: boolean;
    _storedError: any;
    onProgress: any;
    _loaded: number;
    _readableStream: any;
    _readCapability: import("../shared/util.js").PromiseCapability;
    _isStreamingSupported: boolean;
    get isStreamingSupported(): boolean;
    read(): any;
    cancel(reason: any): void;
    _error(reason: any): void;
    _setReadableStream(readableStream: any): void;
}
export {};
