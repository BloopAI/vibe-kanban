export declare type Transform = {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
};
export interface Transition {
    property: string;
    easing: string;
    duration: number;
}
export declare const CSS: Readonly<{
    Translate: {
        toString(transform: Transform | null): string | undefined;
    };
    Scale: {
        toString(transform: Transform | null): string | undefined;
    };
    Transform: {
        toString(transform: Transform | null): string | undefined;
    };
    Transition: {
        toString({ property, duration, easing }: Transition): string;
    };
}>;
