import { createFileRoute } from "@tanstack/react-router";
import UpgradePage from "../pages/UpgradePage";
import { upgradeSearchValidator } from "./-search-schemas";

export const Route = createFileRoute("/upgrade")({
  validateSearch: upgradeSearchValidator,
  component: UpgradePage,
});
