import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import UpgradePage from "@remote/pages/UpgradePage";

const searchSchema = z.object({
  org_id: z.string().optional(),
});

export const Route = createFileRoute("/upgrade")({
  validateSearch: zodValidator(searchSchema),
  component: UpgradePage,
});
