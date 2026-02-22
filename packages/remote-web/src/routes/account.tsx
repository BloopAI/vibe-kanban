import { createFileRoute } from "@tanstack/react-router";
import AccountPage from "../pages/AccountPage";

export const Route = createFileRoute("/account")({
  component: AccountPage,
});
