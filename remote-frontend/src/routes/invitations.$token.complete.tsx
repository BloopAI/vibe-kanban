import { createFileRoute } from "@tanstack/react-router";
import InvitationCompletePage from "../pages/InvitationCompletePage";
import { oauthCallbackSearchValidator } from "./-search-schemas";

export const Route = createFileRoute("/invitations/$token/complete")({
  validateSearch: oauthCallbackSearchValidator,
  component: InvitationCompletePage,
});
