export declare class Listeners {
    private target;
    private listeners;
    constructor(target: EventTarget | null);
    add<T extends Event>(eventName: string, handler: (event: T) => void, options?: AddEventListenerOptions | boolean): void;
    removeAll: () => void;
}
