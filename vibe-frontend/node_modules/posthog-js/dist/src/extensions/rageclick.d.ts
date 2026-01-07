import { RageclickConfig } from '../types';
export default class RageClick {
    clicks: {
        x: number;
        y: number;
        timestamp: number;
    }[];
    thresholdPx: number;
    timeoutMs: number;
    clickCount: number;
    disabled: boolean;
    constructor(rageclickConfig: RageclickConfig | boolean);
    isRageClick(x: number, y: number, timestamp: number): boolean;
}
