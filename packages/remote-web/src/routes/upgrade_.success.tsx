import { createFileRoute } from "@tanstack/react-router";
import UpgradeSuccessPage from "@remote/pages/UpgradeSuccessPage";

export const Route = createFileRoute("/upgrade_/success")({
  component: UpgradeSuccessPage,
});
