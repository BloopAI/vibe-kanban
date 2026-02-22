import { createFileRoute } from "@tanstack/react-router";
import AccountCompletePage from "../pages/AccountCompletePage";
import { oauthCallbackSearchValidator } from "./-search-schemas";

export const Route = createFileRoute("/account_/complete")({
  validateSearch: oauthCallbackSearchValidator,
  component: AccountCompletePage,
});
