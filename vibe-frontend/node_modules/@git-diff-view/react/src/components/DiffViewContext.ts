import { createContext, useContext } from "react";

import type { createDiffConfigStore } from "./tools";

export const DiffViewContext = createContext<{
  useDiffContext: ReturnType<typeof createDiffConfigStore>;
}>(null);

DiffViewContext.displayName = "DiffViewContext";

export const useDiffViewContext = () => useContext(DiffViewContext);
