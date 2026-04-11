declare module "virtual:executor-schemas" {
  import type { BaseCodingAgent } from "@/shared/types";

  type RJSFSchema = Record<string, unknown>;

  const schemas: Record<BaseCodingAgent, RJSFSchema>;
  export { schemas };
  export default schemas;
}
