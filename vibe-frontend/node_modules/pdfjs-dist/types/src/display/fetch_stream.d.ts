/** @implements {IPDFStream} */
export class PDFFetchStream implements IPDFStream {
    constructor(source: any);
    source: any;
    isHttp: boolean;
    httpHeaders: any;
    _fullRequestReader: PDFFetchStreamReader | null;
    _rangeRequestReaders: any[];
    get _progressiveDataLength(): number;
    getFullReader(): PDFFetchStreamReader;
    getRangeReader(begin: any, end: any): PDFFetchStreamRangeReader | null;
    cancelAllRequests(reason: any): void;
}
/** @implements {IPDFStreamReader} */
declare class PDFFetchStreamReader implements IPDFStreamReader {
    constructor(stream: any);
    _stream: any;
    _reader: ReadableStreamDefaultReader<Uint8Array> | null;
    _loaded: number;
    _filename: string | null;
    _withCredentials: any;
    _contentLength: any;
    _headersCapability: import("../shared/util.js").PromiseCapability;
    _disableRange: any;
    _rangeChunkSize: any;
    _abortController: AbortController;
    _isStreamingSupported: boolean;
    _isRangeSupported: boolean;
    _headers: Headers;
    onProgress: any;
    get headersReady(): Promise<any>;
    get filename(): string | null;
    get contentLength(): any;
    get isRangeSupported(): boolean;
    get isStreamingSupported(): boolean;
    read(): Promise<{
        value: Uint8Array | undefined;
        done: true;
    } | {
        value: ArrayBufferLike;
        done: boolean;
    }>;
    cancel(reason: any): void;
}
/** @implements {IPDFStreamRangeReader} */
declare class PDFFetchStreamRangeReader implements IPDFStreamRangeReader {
    constructor(stream: any, begin: any, end: any);
    _stream: any;
    _reader: ReadableStreamDefaultReader<Uint8Array> | null;
    _loaded: number;
    _withCredentials: any;
    _readCapability: import("../shared/util.js").PromiseCapability;
    _isStreamingSupported: boolean;
    _abortController: AbortController;
    _headers: Headers;
    onProgress: any;
    get isStreamingSupported(): boolean;
    read(): Promise<{
        value: Uint8Array | undefined;
        done: true;
    } | {
        value: ArrayBufferLike;
        done: boolean;
    }>;
    cancel(reason: any): void;
}
export {};
