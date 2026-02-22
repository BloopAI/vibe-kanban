import { createFileRoute } from "@tanstack/react-router";
import UpgradeCompletePage from "../pages/UpgradeCompletePage";
import { oauthCallbackSearchValidator } from "./-search-schemas";

export const Route = createFileRoute("/upgrade_/complete")({
  validateSearch: oauthCallbackSearchValidator,
  component: UpgradeCompletePage,
});
