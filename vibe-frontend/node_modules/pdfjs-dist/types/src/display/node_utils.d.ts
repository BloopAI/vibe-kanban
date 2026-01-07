export class NodeCanvasFactory extends BaseCanvasFactory {
    /**
     * @ignore
     */
    _createCanvas(width: any, height: any): any;
}
export class NodeCMapReaderFactory extends BaseCMapReaderFactory {
    /**
     * @ignore
     */
    _fetchData(url: any, compressionType: any): Promise<{
        cMapData: any;
        compressionType: any;
    }>;
}
export class NodeStandardFontDataFactory extends BaseStandardFontDataFactory {
    /**
     * @ignore
     */
    _fetchData(url: any): Promise<any>;
}
import { BaseCanvasFactory } from "./base_factory.js";
import { BaseCMapReaderFactory } from "./base_factory.js";
import { BaseStandardFontDataFactory } from "./base_factory.js";
