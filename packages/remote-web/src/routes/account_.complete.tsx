import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import LoginCompletePage from "../pages/LoginCompletePage";

const searchSchema = z.object({
  handoff_id: z.string().optional(),
  app_code: z.string().optional(),
  error: z.string().optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute("/account_/complete")({
  component: LoginCompletePage,
  validateSearch: zodValidator(searchSchema),
});
