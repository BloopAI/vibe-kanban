import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/pages/workspaces/NotificationsPage";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";

export const Route = createFileRoute("/notifications")({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  component: NotificationsPage,
});
