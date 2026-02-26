import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import WorkspacesUnavailablePage from "@remote/pages/WorkspacesUnavailablePage";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";

const searchSchema = z.object({
  hostId: z.string().optional(),
});

export const Route = createFileRoute("/workspaces")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  component: WorkspacesUnavailablePage,
});
