/** @implements {IPDFStream} */
export class PDFDataTransportStream implements IPDFStream {
    constructor({ length, initialData, progressiveDone, contentDispositionFilename, disableRange, disableStream, }: {
        length: any;
        initialData: any;
        progressiveDone?: boolean | undefined;
        contentDispositionFilename?: null | undefined;
        disableRange?: boolean | undefined;
        disableStream?: boolean | undefined;
    }, pdfDataRangeTransport: any);
    _queuedChunks: ArrayBuffer[];
    _progressiveDone: boolean;
    _contentDispositionFilename: any;
    _pdfDataRangeTransport: any;
    _isStreamingSupported: boolean;
    _isRangeSupported: boolean;
    _contentLength: any;
    _fullRequestReader: any;
    _rangeReaders: any[];
    _onReceiveData({ begin, chunk }: {
        begin: any;
        chunk: any;
    }): void;
    get _progressiveDataLength(): any;
    _onProgress(evt: any): void;
    _onProgressiveDone(): void;
    _removeRangeReader(reader: any): void;
    getFullReader(): PDFDataTransportStreamReader;
    getRangeReader(begin: any, end: any): PDFDataTransportStreamRangeReader | null;
    cancelAllRequests(reason: any): void;
}
/** @implements {IPDFStreamReader} */
declare class PDFDataTransportStreamReader implements IPDFStreamReader {
    constructor(stream: any, queuedChunks: any, progressiveDone?: boolean, contentDispositionFilename?: null);
    _stream: any;
    _done: boolean;
    _filename: any;
    _queuedChunks: any;
    _loaded: number;
    _requests: any[];
    _headersReady: Promise<void>;
    onProgress: any;
    _enqueue(chunk: any): void;
    get headersReady(): Promise<void>;
    get filename(): any;
    get isRangeSupported(): any;
    get isStreamingSupported(): any;
    get contentLength(): any;
    read(): Promise<any>;
    cancel(reason: any): void;
    progressiveDone(): void;
}
/** @implements {IPDFStreamRangeReader} */
declare class PDFDataTransportStreamRangeReader implements IPDFStreamRangeReader {
    constructor(stream: any, begin: any, end: any);
    _stream: any;
    _begin: any;
    _end: any;
    _queuedChunk: any;
    _requests: any[];
    _done: boolean;
    onProgress: any;
    _enqueue(chunk: any): void;
    get isStreamingSupported(): boolean;
    read(): Promise<any>;
    cancel(reason: any): void;
}
export {};
