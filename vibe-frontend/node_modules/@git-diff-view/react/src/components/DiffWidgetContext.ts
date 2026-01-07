import { createContext, useContext } from "react";

import type { SplitSide } from "..";
import type { Ref, UseSelectorWithStore } from "reactivity-store";

export const DiffWidgetContext = createContext<{
  useWidget: UseSelectorWithStore<{
    widgetSide: Ref<SplitSide>;
    widgetLineNumber: Ref<number>;

    setWidget: (props: { side?: SplitSide; lineNumber?: number }) => void;
  }>;
}>(null);

DiffWidgetContext.displayName = "DiffWidgetContext";

export const useDiffWidgetContext = () => useContext(DiffWidgetContext);
