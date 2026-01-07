import { useEffect } from "react";

import { useDiffViewContext } from "../components/DiffViewContext";

import type { ObserveElement } from "./useDomWidth";

export const useSyncHeight = ({
  selector,
  wrapper,
  side,
  enable,
}: {
  selector: string;
  wrapper?: string;
  side: string;
  enable: boolean;
}) => {
  const { useDiffContext } = useDiffViewContext();

  const { id, mounted } = useDiffContext.useShallowStableSelector((s) => ({ id: s.id, mounted: s.mounted }));

  useEffect(() => {
    if (enable) {
      const container = document.querySelector(`#diff-root${id}`);

      const elements = Array.from(container?.querySelectorAll(selector) || []);

      const wrappers = wrapper ? Array.from(container?.querySelectorAll(wrapper) || []) : elements;

      if (elements.length === 2 && wrappers.length === 2) {
        const ele1 = elements[0] as HTMLElement;
        const ele2 = elements[1] as HTMLElement;

        const wrapper1 = wrappers[0] as HTMLElement;
        const wrapper2 = wrappers[1] as HTMLElement;

        const target = ele1.getAttribute("data-side") === side ? ele1 : ele2;

        const typedTarget = target as ObserveElement;

        const cb = () => {
          ele1.style.height = "auto";
          ele2.style.height = "auto";
          const rect1 = ele1.getBoundingClientRect();
          const rect2 = ele2.getBoundingClientRect();
          const maxHeight = Math.max(rect1.height, rect2.height);
          wrapper1.style.height = maxHeight + "px";
          wrapper2.style.height = maxHeight + "px";
          wrapper1.setAttribute("data-sync-height", String(maxHeight));
          wrapper2.setAttribute("data-sync-height", String(maxHeight));
        };

        cb();

        const cleanCb = () => {
          typedTarget.__observeCallback.delete(cb);
          if (typedTarget.__observeCallback.size === 0) {
            typedTarget.__observeInstance?.disconnect();
            typedTarget.removeAttribute("data-observe");
            delete typedTarget.__observeCallback;
            delete typedTarget.__observeInstance;
          }
        };

        if (typedTarget.__observeCallback) {
          typedTarget.__observeCallback.add(cb);

          return () => cleanCb();
        }

        typedTarget.__observeCallback = new Set();

        typedTarget.__observeCallback.add(cb);

        const observer = new ResizeObserver(() => typedTarget.__observeCallback.forEach((cb) => cb()));

        typedTarget.__observeInstance = observer;

        observer.observe(target);

        target.setAttribute("data-observe", "height");

        return () => cleanCb();
      }
    }
  }, [selector, enable, side, id, wrapper, mounted]);
};
