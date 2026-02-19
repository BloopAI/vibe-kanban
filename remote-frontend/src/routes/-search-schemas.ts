import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";

export const oauthCallbackSearchSchema = z.object({
  handoff_id: z.string().optional(),
  app_code: z.string().optional(),
  error: z.string().optional(),
});

export const organizationSearchSchema = z.object({
  github_app: z.string().optional(),
  github_app_error: z.string().optional(),
  billing: z.string().optional(),
});

export const upgradeSearchSchema = z.object({
  org_id: z.string().optional(),
});

export const oauthCallbackSearchValidator = zodValidator(
  oauthCallbackSearchSchema,
);
export const organizationSearchValidator = zodValidator(
  organizationSearchSchema,
);
export const upgradeSearchValidator = zodValidator(upgradeSearchSchema);
