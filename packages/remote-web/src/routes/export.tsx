import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import ExportPage from "../pages/ExportPage";

export const Route = createFileRoute("/export")({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  component: ExportPage,
});
