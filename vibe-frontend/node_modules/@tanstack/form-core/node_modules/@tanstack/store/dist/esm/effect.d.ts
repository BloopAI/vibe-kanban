import { Derived, DerivedOptions } from './derived.js';
interface EffectOptions extends Omit<DerivedOptions<unknown>, 'onUpdate' | 'onSubscribe' | 'lazy' | 'fn'> {
    /**
     * Should the effect trigger immediately?
     * @default false
     */
    eager?: boolean;
    fn: () => void;
}
export declare class Effect {
    /**
     * @private
     */
    _derived: Derived<void>;
    constructor(opts: EffectOptions);
    mount(): () => void;
}
export {};
