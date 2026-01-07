import { AnyFormApi, FormValidators } from './FormApi.cjs';
interface ValidationLogicValidatorsFn {
    fn: FormValidators<any, any, any, any, any, any, any, any, any, any>[keyof FormValidators<any, any, any, any, any, any, any, any, any, any>];
    cause: 'change' | 'blur' | 'submit' | 'mount' | 'server' | 'dynamic';
}
export interface ValidationLogicProps {
    form: AnyFormApi;
    validators: FormValidators<any, any, any, any, any, any, any, any, any, any> | undefined | null;
    event: {
        type: 'blur' | 'change' | 'submit' | 'mount' | 'server';
        fieldName?: string;
        async: boolean;
    };
    runValidation: (props: {
        validators: Array<ValidationLogicValidatorsFn | undefined>;
        form: AnyFormApi;
    }) => void;
}
interface RevalidateLogicProps {
    /**
     * @default 'submit'
     *
     * This is the mode that will be used before the form has been submitted.
     * It will run the validation logic on `submit` by default, but can be set to `change` or `blur`.
     */
    mode?: 'change' | 'blur' | 'submit';
    /**
     * @default 'change'
     *
     * This is the mode that will be used after the form has been submitted.
     * It will run the validation logic on `change` by default, but can be set to `blur` or `submit`.
     */
    modeAfterSubmission?: 'change' | 'blur' | 'submit';
}
export type ValidationLogicFn = (props: ValidationLogicProps) => void;
/**
 * This forces a form's validation logic to be ran as if it were a React Hook Form validation logic.
 *
 * This means that it will only run the `onDynamic` validator, and it will not run any other validators and changes the validation
 * type based on the state of the form itself.
 *
 * When the form is not yet submitted, it will not run the validation logic.
 * When the form is submitted, it will run the validation logic on `change`
 */
export declare const revalidateLogic: ({ mode, modeAfterSubmission, }?: RevalidateLogicProps) => ValidationLogicFn;
export declare const defaultValidationLogic: ValidationLogicFn;
export {};
