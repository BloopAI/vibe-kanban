import { ErrorThrowerOptions } from '@clerk/shared/error';
export { M as MultisessionAppSupport, u as useDerivedAuth } from './useAuth-fq1pQd_y.js';
import { RoutingOptions } from '@clerk/shared/types';
export { buildClerkJsScriptAttributes, clerkJsScriptUrl, setClerkJsLoadingErrorPackageName } from '@clerk/shared/loadClerkJsScript';
import 'react';
import './types-CFOQkf-D.js';

/**
 * Overrides options of the internal errorThrower (eg setting packageName prefix).
 *
 * @internal
 */
declare function setErrorThrowerOptions(options: ErrorThrowerOptions): void;

declare function useRoutingProps<T extends RoutingOptions>(componentName: string, props: T, routingOptions?: RoutingOptions): T;

export { setErrorThrowerOptions, useRoutingProps };
