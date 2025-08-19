import { useLayoutEffect, useRef, useState } from 'react';

interface UseVisibleVariantsProps {
  variants: string[];
  selectedVariant: string;
  containerRef: React.RefObject<HTMLDivElement>;
  chipRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  moreButtonRef: React.RefObject<HTMLDivElement>;
}

export function useVisibleVariants({
  variants,
  selectedVariant,
  containerRef,
  chipRefs,
  moreButtonRef,
}: UseVisibleVariantsProps) {
  const [visibleCount, setVisibleCount] = useState(variants.length);
  const resizeObserverRef = useRef<ResizeObserver>();

  const measureVariants = () => {
    if (
      !containerRef.current ||
      !moreButtonRef.current ||
      variants.length === 0
    ) {
      setVisibleCount(variants.length);
      return;
    }

    const container = containerRef.current;
    const moreButton = moreButtonRef.current;
    const containerWidth = container.offsetWidth - 16; // Account for padding
    const moreButtonWidth = moreButton.offsetWidth + 4; // Include gap
    const gap = 4; // Gap between chips

    let totalWidth = 0;
    let count = 0;

    // First pass: calculate how many variants fit
    for (let i = 0; i < variants.length; i++) {
      const chipEl = chipRefs.current[i];
      if (!chipEl) continue;

      const chipWidth = chipEl.offsetWidth + gap;

      // Check if we need to reserve space for the "more" button
      const needsMoreButton = i < variants.length - 1;
      const requiredSpace =
        totalWidth + chipWidth + (needsMoreButton ? moreButtonWidth : 0);

      if (requiredSpace > containerWidth && count > 0) {
        break;
      }

      totalWidth += chipWidth;
      count++;
    }

    // Special case: if selected variant is hidden, swap it with the last visible one
    const selectedIndex = variants.indexOf(selectedVariant);
    if (selectedIndex >= count && selectedIndex !== -1 && count > 0) {
      // Don't change the count, just note that we need to show the selected one
      // The component will handle reordering the display
    }

    setVisibleCount(count);
  };

  // Set up ResizeObserver
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      // Small delay to ensure layout is complete
      requestAnimationFrame(measureVariants);
    });

    resizeObserverRef.current.observe(containerRef.current);

    // Initial measurement
    requestAnimationFrame(measureVariants);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [variants, selectedVariant]);

  // Re-measure when variants or selection changes
  useLayoutEffect(() => {
    requestAnimationFrame(measureVariants);
  }, [variants, selectedVariant]);

  const getVisibleVariants = () => {
    if (visibleCount >= variants.length) {
      return { visible: variants, hidden: [] };
    }

    const selectedIndex = variants.indexOf(selectedVariant);

    // If selected variant would be hidden, prioritize showing it
    if (selectedIndex >= visibleCount && selectedIndex !== -1) {
      const visible = [...variants.slice(0, visibleCount - 1), selectedVariant];
      const hidden = [
        ...variants.slice(visibleCount - 1, selectedIndex),
        ...variants.slice(selectedIndex + 1),
      ];
      return { visible, hidden };
    }

    return {
      visible: variants.slice(0, visibleCount),
      hidden: variants.slice(visibleCount),
    };
  };

  const { visible, hidden } = getVisibleVariants();

  return {
    visibleVariants: visible,
    hiddenVariants: hidden,
    hasOverflow: hidden.length > 0,
  };
}
