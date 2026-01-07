import { FieldValidators } from './FieldApi.cjs';
import { AnyFormApi, FormValidators } from './FormApi.cjs';
import { GlobalFormValidationError, ValidationCause, ValidationError, ValidationSource } from './types.cjs';
export type UpdaterFn<TInput, TOutput = TInput> = (input: TInput) => TOutput;
export type Updater<TInput, TOutput = TInput> = TOutput | UpdaterFn<TInput, TOutput>;
/**
 * @private
 */
export declare function functionalUpdate<TInput, TOutput = TInput>(updater: Updater<TInput, TOutput>, input: TInput): TOutput;
/**
 * Get a value from an object using a path, including dot notation.
 * @private
 */
export declare function getBy(obj: unknown, path: string | (string | number)[]): any;
/**
 * Set a value on an object using a path, including dot notation.
 * @private
 */
export declare function setBy(obj: any, _path: any, updater: Updater<any>): any;
/**
 * Delete a field on an object using a path, including dot notation.
 * @private
 */
export declare function deleteBy(obj: any, _path: any): any;
/**
 * @private
 */
export declare function makePathArray(str: string | Array<string | number>): (string | number)[];
/**
 * @private
 */
export declare function concatenatePaths(path1: string, path2: string): string;
/**
 * @private
 */
export declare function isNonEmptyArray(obj: any): boolean;
interface AsyncValidatorArrayPartialOptions<T> {
    validators?: T;
    asyncDebounceMs?: number;
}
/**
 * @private
 */
export interface AsyncValidator<T> {
    cause: ValidationCause;
    validate: T;
    debounceMs: number;
}
interface SyncValidatorArrayPartialOptions<T> {
    validators?: T;
}
/**
 * @private
 */
export interface SyncValidator<T> {
    cause: ValidationCause;
    validate: T;
}
/**
 * @private
 */
export declare function getSyncValidatorArray<T>(cause: ValidationCause, options: SyncValidatorArrayPartialOptions<T> & {
    validationLogic?: any;
    form?: any;
}): T extends FieldValidators<any, any, any, any, any, any, any, any, any, any, any, any> ? Array<SyncValidator<T['onChange'] | T['onBlur'] | T['onSubmit'] | T['onMount'] | T['onDynamic']>> : T extends FormValidators<any, any, any, any, any, any, any, any, any, any> ? Array<SyncValidator<T['onChange'] | T['onBlur'] | T['onSubmit'] | T['onMount'] | T['onDynamic']>> : never;
/**
 * @private
 */
export declare function getAsyncValidatorArray<T>(cause: ValidationCause, options: AsyncValidatorArrayPartialOptions<T> & {
    validationLogic?: any;
    form?: any;
}): T extends FieldValidators<any, any, any, any, any, any, any, any, any, any, any, any> ? Array<AsyncValidator<T['onChangeAsync'] | T['onBlurAsync'] | T['onSubmitAsync'] | T['onDynamicAsync']>> : T extends FormValidators<any, any, any, any, any, any, any, any, any, any> ? Array<AsyncValidator<T['onChangeAsync'] | T['onBlurAsync'] | T['onSubmitAsync'] | T['onDynamicAsync']>> : never;
export declare const isGlobalFormValidationError: (error: unknown) => error is GlobalFormValidationError<unknown>;
export declare function evaluate<T>(objA: T, objB: T): boolean;
/**
 * Determines the logic for determining the error source and value to set on the field meta within the form level sync/async validation.
 * @private
 */
export declare const determineFormLevelErrorSourceAndValue: ({ newFormValidatorError, isPreviousErrorFromFormValidator, previousErrorValue, }: {
    newFormValidatorError: ValidationError;
    isPreviousErrorFromFormValidator: boolean;
    previousErrorValue: ValidationError;
}) => {
    newErrorValue: ValidationError;
    newSource: ValidationSource | undefined;
};
/**
 * Determines the logic for determining the error source and value to set on the field meta within the field level sync/async validation.
 * @private
 */
export declare const determineFieldLevelErrorSourceAndValue: ({ formLevelError, fieldLevelError, }: {
    formLevelError: ValidationError;
    fieldLevelError: ValidationError;
}) => {
    newErrorValue: ValidationError;
    newSource: ValidationSource | undefined;
};
export declare function createFieldMap<T>(values: Readonly<T>): {
    [K in keyof T]: K;
};
/**
 * Merge the first parameter with the given overrides.
 * @private
 */
export declare function mergeOpts<T>(originalOpts: T | undefined | null, overrides: T): T;
export declare function uuid(): string;
export declare const throttleFormState: (form: AnyFormApi) => void;
export {};
