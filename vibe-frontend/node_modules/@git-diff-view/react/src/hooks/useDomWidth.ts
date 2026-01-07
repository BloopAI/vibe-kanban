import { useEffect, useState } from "react";

import { useDiffViewContext } from "../components/DiffViewContext";

export type ObserveElement = HTMLElement & {
  __observeCallback: Set<() => void>;
  __observeInstance: ResizeObserver;
};

export const useDomWidth = ({ selector, enable }: { selector: string; enable: boolean }) => {
  const [width, setWidth] = useState(0);

  const { useDiffContext } = useDiffViewContext();

  const { id, mounted } = useDiffContext.useShallowStableSelector((s) => ({ id: s.id, mounted: s.mounted }));

  useEffect(() => {
    if (enable) {
      const container = document.querySelector(`#diff-root${id}`);

      const wrapper = container?.querySelector(selector);

      if (!wrapper) return;

      const typedWrapper = wrapper as ObserveElement;

      const cb = () => {
        const rect = wrapper?.getBoundingClientRect();
        setWidth(rect?.width ?? 0);
      };

      cb();

      const cleanCb = () => {
        typedWrapper.__observeCallback.delete(cb);
        if (typedWrapper.__observeCallback.size === 0) {
          typedWrapper.__observeInstance?.disconnect();
          typedWrapper.removeAttribute("data-observe");
          delete typedWrapper.__observeCallback;
          delete typedWrapper.__observeInstance;
        }
      };

      if (typedWrapper.__observeCallback) {
        typedWrapper.__observeCallback.add(cb);

        return () => cleanCb();
      }

      typedWrapper.__observeCallback = new Set();

      typedWrapper.__observeCallback.add(cb);

      const observer = new ResizeObserver(() => typedWrapper.__observeCallback.forEach((cb) => cb()));

      typedWrapper.__observeInstance = observer;

      observer.observe(typedWrapper);

      typedWrapper.setAttribute("data-observe", "height");

      return () => cleanCb();
    }
  }, [selector, enable, id, mounted]);

  return width;
};
