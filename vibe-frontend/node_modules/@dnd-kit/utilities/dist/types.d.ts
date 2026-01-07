export declare type Arguments<T> = T extends (...args: infer U) => any ? U : never;
export declare type DeepRequired<T> = {
    [K in keyof T]-?: Required<T[K]>;
};
export declare type FirstArgument<T> = T extends (firstArg: infer U, ...args: Array<any>) => any ? U : never;
export declare type Without<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
