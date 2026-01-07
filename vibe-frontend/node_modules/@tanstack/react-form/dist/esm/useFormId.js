import * as React from "react";
import { useUUID } from "./useUUID.js";
const useFormId = React.version.split(".")[0] === "17" ? useUUID : React.useId;
export {
  useFormId
};
//# sourceMappingURL=useFormId.js.map
