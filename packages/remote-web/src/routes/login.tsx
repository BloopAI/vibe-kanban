import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/account",
      search: search.next ? { next: search.next } : undefined,
    });
  },
});
