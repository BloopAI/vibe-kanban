import { useRef, useCallback, useEffect, useState } from 'react';

export interface UseStickyObserverOptions {
  onStickyChange: (path: string | null) => void;
}

export interface UseStickyObserverResult {
  observeSentinel: (path: string, element: HTMLElement | null) => void;
  setScrollContainer: (element: HTMLElement | null) => void;
}

export function useStickyObserver(
  options: UseStickyObserverOptions
): UseStickyObserverResult {
  const { onStickyChange } = options;

  const elementToPathRef = useRef<Map<Element, string>>(new Map());
  const aboveSentinelsRef = useRef<Map<string, number>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [scrollContainer, setScrollContainerState] = useState<HTMLElement | null>(null);

  const setScrollContainer = useCallback((element: HTMLElement | null) => {
    setScrollContainerState(element);
  }, []);

  const updateCurrentSticky = useCallback(() => {
    let bestPath: string | null = null;
    let bestTop = -Infinity;

    for (const [path, top] of aboveSentinelsRef.current.entries()) {
      if (top > bestTop) {
        bestTop = top;
        bestPath = path;
      }
    }

    onStickyChange(bestPath);
  }, [onStickyChange]);

  const createObserver = useCallback((root: HTMLElement | null) => {
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const path = elementToPathRef.current.get(entry.target);
          if (!path) continue;

          if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
            aboveSentinelsRef.current.set(path, entry.boundingClientRect.top);
          } else {
            aboveSentinelsRef.current.delete(path);
          }
        }

        updateCurrentSticky();
      },
      {
        root,
        rootMargin: '0px 0px -100% 0px',
        threshold: 0,
      }
    );

    return observerRef.current;
  }, [updateCurrentSticky]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

   useEffect(() => {
     aboveSentinelsRef.current.clear();

     const observer = createObserver(scrollContainer);

     for (const element of elementToPathRef.current.keys()) {
       observer.observe(element);
     }

     // IntersectionObserver doesn't fire immediately on observe() - only on changes.
     // Manually calculate initial state of all sentinels.
     if (scrollContainer) {
       const containerRect = scrollContainer.getBoundingClientRect();
       for (const [element, path] of elementToPathRef.current.entries()) {
         const elementRect = element.getBoundingClientRect();
         // Check if sentinel is above the top of scroll container
         if (elementRect.top < containerRect.top) {
           aboveSentinelsRef.current.set(path, elementRect.top - containerRect.top);
         }
       }
     }

     updateCurrentSticky();
   }, [scrollContainer, createObserver, updateCurrentSticky]);

  const observeSentinel = useCallback(
    (path: string, element: HTMLElement | null) => {
      for (const [el, p] of elementToPathRef.current.entries()) {
        if (p === path) {
          observerRef.current?.unobserve(el);
          elementToPathRef.current.delete(el);
          break;
        }
      }

      if (element) {
        elementToPathRef.current.set(element, path);
        observerRef.current?.observe(element);
      } else {
        aboveSentinelsRef.current.delete(path);
        updateCurrentSticky();
      }
    },
    [updateCurrentSticky]
  );

  return { observeSentinel, setScrollContainer };
}
