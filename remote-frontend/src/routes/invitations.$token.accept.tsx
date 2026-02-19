import { createFileRoute } from "@tanstack/react-router";
import InvitationPage from "../pages/InvitationPage";

export const Route = createFileRoute("/invitations/$token/accept")({
  component: InvitationPage,
});
