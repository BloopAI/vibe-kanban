import { createFileRoute } from "@tanstack/react-router";
import UpgradeSuccessPage from "../pages/UpgradeSuccessPage";

export const Route = createFileRoute("/upgrade_/success")({
  component: UpgradeSuccessPage,
});
