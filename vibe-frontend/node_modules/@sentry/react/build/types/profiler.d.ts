import type { Span } from '@sentry/core';
import * as React from 'react';
export declare const UNKNOWN_COMPONENT = "unknown";
export type ProfilerProps = {
    name: string;
    disabled?: boolean;
    includeRender?: boolean;
    includeUpdates?: boolean;
    children?: React.ReactNode;
    updateProps: {
        [key: string]: unknown;
    };
};
/**
 * The Profiler component leverages Sentry's Tracing integration to generate
 * spans based on component lifecycles.
 */
declare class Profiler extends React.Component<ProfilerProps> {
    /**
     * The span of the mount activity
     * Made protected for the React Native SDK to access
     */
    protected _mountSpan: Span | undefined;
    /**
     * The span that represents the duration of time between shouldComponentUpdate and componentDidUpdate
     */
    protected _updateSpan: Span | undefined;
    constructor(props: ProfilerProps);
    componentDidMount(): void;
    shouldComponentUpdate({ updateProps, includeUpdates }: ProfilerProps): boolean;
    componentDidUpdate(): void;
    componentWillUnmount(): void;
    render(): React.ReactNode;
}
/**
 * withProfiler is a higher order component that wraps a
 * component in a {@link Profiler} component. It is recommended that
 * the higher order component be used over the regular {@link Profiler} component.
 *
 * @param WrappedComponent component that is wrapped by Profiler
 * @param options the {@link ProfilerProps} you can pass into the Profiler
 */
declare function withProfiler<P extends Record<string, any>>(WrappedComponent: React.ComponentType<P>, options?: Pick<Partial<ProfilerProps>, Exclude<keyof ProfilerProps, 'updateProps' | 'children'>>): React.FC<P>;
/**
 *
 * `useProfiler` is a React hook that profiles a React component.
 *
 * Requires React 16.8 or above.
 * @param name displayName of component being profiled
 */
declare function useProfiler(name: string, options?: {
    disabled?: boolean;
    hasRenderSpan?: boolean;
}): void;
export { Profiler, useProfiler, withProfiler };
//# sourceMappingURL=profiler.d.ts.map