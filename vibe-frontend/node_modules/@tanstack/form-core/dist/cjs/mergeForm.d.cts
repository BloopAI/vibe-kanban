import { FormApi } from './FormApi.cjs';
/**
 * @private
 */
export declare function mutateMergeDeep(target: object | null | undefined, source: object | null | undefined): object;
export declare function mergeForm<TFormData>(baseForm: FormApi<NoInfer<TFormData>, any, any, any, any, any, any, any, any, any, any, any>, state: Partial<FormApi<TFormData, any, any, any, any, any, any, any, any, any, any, any>['state']>): FormApi<NoInfer<TFormData>, any, any, any, any, any, any, any, any, any, any, any>;
