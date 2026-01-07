export function createResponseStatusError(status: any, url: any): MissingPDFException | UnexpectedResponseException;
export function extractFilenameFromHeader(getResponseHeader: any): string | null;
export function validateRangeRequestCapabilities({ getResponseHeader, isHttp, rangeChunkSize, disableRange, }: {
    getResponseHeader: any;
    isHttp: any;
    rangeChunkSize: any;
    disableRange: any;
}): {
    allowRangeRequests: boolean;
    suggestedLength: undefined;
};
export function validateResponseStatus(status: any): boolean;
import { MissingPDFException } from "../shared/util.js";
import { UnexpectedResponseException } from "../shared/util.js";
