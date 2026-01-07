export type IDownloadManager = import("./interfaces").IDownloadManager;
/**
 * @implements {IDownloadManager}
 */
export class DownloadManager implements IDownloadManager {
    downloadUrl(url: any, filename: any): void;
    downloadData(data: any, filename: any, contentType: any): void;
    /**
     * @returns {boolean} Indicating if the data was opened.
     */
    openOrDownloadData(element: any, data: any, filename: any): boolean;
    download(blob: any, url: any, filename: any): void;
    #private;
}
