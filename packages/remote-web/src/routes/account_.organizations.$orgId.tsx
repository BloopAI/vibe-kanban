import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";

export const Route = createFileRoute("/account_/organizations/$orgId")({
  beforeLoad: async ({ location, params }) => {
    await requireAuthenticated(location);

    throw redirect({
      to: "/",
      search: { legacyOrgSettingsOrgId: params.orgId },
    });
  },
});
