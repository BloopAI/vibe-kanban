import { EventClient } from '@tanstack/devtools-event-client';
import { AnyFormOptions, AnyFormState } from './FormApi.cjs';
type ExtractEventNames<T> = T extends `${string}:${infer EventName}` ? EventName : never;
export type BroadcastFormState = {
    id: string;
    state: AnyFormState;
};
export type BroadcastFormApi = {
    id: string;
    state: AnyFormState;
    options: AnyFormOptions;
};
export type BroadcastFormSubmissionState = {
    id: string;
    submissionAttempt: number;
    successful: false;
    stage: 'validateAllFields' | 'validate';
    errors: any[];
} | {
    id: string;
    submissionAttempt: number;
    successful: false;
    stage: 'inflight';
    onError: unknown;
} | {
    id: string;
    submissionAttempt: number;
    successful: true;
};
export type BroadcastFormId = {
    id: string;
};
type EventMap = {
    'form-devtools:form-state': BroadcastFormState;
    'form-devtools:form-api': BroadcastFormApi;
    'form-devtools:form-submission': BroadcastFormSubmissionState;
    'form-devtools:request-form-state': BroadcastFormId;
    'form-devtools:request-form-reset': BroadcastFormId;
    'form-devtools:request-form-force-submit': BroadcastFormId;
    'form-devtools:form-unmounted': BroadcastFormId;
};
export type EventClientEventMap = keyof EventMap;
export type EventClientEventNames = ExtractEventNames<EventClientEventMap>;
declare class FormEventClient extends EventClient<EventMap> {
    constructor();
}
export declare const formEventClient: FormEventClient;
export {};
