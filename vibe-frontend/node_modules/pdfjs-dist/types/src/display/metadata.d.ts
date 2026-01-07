export class Metadata {
    constructor({ parsedData, rawData }: {
        parsedData: any;
        rawData: any;
    });
    getRaw(): any;
    get(name: any): any;
    getAll(): any;
    has(name: any): any;
    #private;
}
