export type GlobalWorkerOptionsType = {
    /**
     * - Defines global port for worker
     * process. Overrides the `workerSrc` option.
     */
    workerPort: Worker | null;
    /**
     * - A string containing the path and filename
     * of the worker file.
     *
     * NOTE: The `workerSrc` option should always be set, in order to prevent any
     * issues when using the PDF.js library.
     */
    workerSrc: string;
};
/**
 * @typedef {Object} GlobalWorkerOptionsType
 * @property {Worker | null} workerPort - Defines global port for worker
 *   process. Overrides the `workerSrc` option.
 * @property {string} workerSrc - A string containing the path and filename
 *   of the worker file.
 *
 *   NOTE: The `workerSrc` option should always be set, in order to prevent any
 *         issues when using the PDF.js library.
 */
/** @type {GlobalWorkerOptionsType} */
export const GlobalWorkerOptions: GlobalWorkerOptionsType;
