import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import UpgradeCompletePage from "@remote/pages/UpgradeCompletePage";

const searchSchema = z.object({
  handoff_id: z.string().optional(),
  app_code: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/upgrade_/complete")({
  validateSearch: zodValidator(searchSchema),
  component: UpgradeCompletePage,
});
