export class OptionalContentConfig {
    constructor(data: any);
    name: any;
    creator: any;
    isVisible(group: any): any;
    setVisibility(id: any, visible?: boolean): void;
    get hasInitialVisibility(): boolean;
    getOrder(): any;
    getGroups(): any;
    getGroup(id: any): any;
    getHash(): string;
    #private;
}
