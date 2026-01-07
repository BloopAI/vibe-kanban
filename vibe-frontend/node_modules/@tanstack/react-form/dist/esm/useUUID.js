import { useState } from "react";
import { uuid } from "@tanstack/form-core";
function useUUID() {
  return useState(() => uuid())[0];
}
export {
  useUUID
};
//# sourceMappingURL=useUUID.js.map
