import { createFileRoute } from "@tanstack/react-router";
import OrganizationPage from "../pages/OrganizationPage";
import { organizationSearchValidator } from "./-search-schemas";

export const Route = createFileRoute("/account_/organizations/$orgId")({
  validateSearch: organizationSearchValidator,
  component: OrganizationPage,
});
