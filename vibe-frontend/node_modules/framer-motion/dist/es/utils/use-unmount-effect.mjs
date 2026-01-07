"use client";
import { useEffect } from 'react';

function useUnmountEffect(callback) {
    return useEffect(() => () => callback(), []);
}

export { useUnmountEffect };
//# sourceMappingURL=use-unmount-effect.mjs.map
