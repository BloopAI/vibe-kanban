import { useLayoutEffect } from 'react';
/**
 * A hook that resolves to useEffect on the server and useLayoutEffect on the client
 * @param callback {function} Callback function that is invoked when the dependencies of the hook change
 */
export declare const useIsomorphicLayoutEffect: typeof useLayoutEffect;
