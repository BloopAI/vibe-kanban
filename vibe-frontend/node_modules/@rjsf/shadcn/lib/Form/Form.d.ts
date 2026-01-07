import { ComponentType } from 'react';
import { FormProps } from '@rjsf/core';
import { FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
export declare function generateForm<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(): ComponentType<FormProps<T, S, F>>;
declare const _default: ComponentType<FormProps<any, RJSFSchema, any>>;
export default _default;
