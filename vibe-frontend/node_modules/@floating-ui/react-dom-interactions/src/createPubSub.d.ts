export declare function createPubSub(): {
    emit(event: string, data: any): void;
    on(event: string, listener: (data: any) => void): void;
    off(event: string, listener: (data: any) => void): void;
};
