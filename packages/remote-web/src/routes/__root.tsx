import { createRootRoute } from "@tanstack/react-router";
import NotFoundPage from "../pages/NotFoundPage";

export const Route = createRootRoute({
  notFoundComponent: NotFoundPage,
});
