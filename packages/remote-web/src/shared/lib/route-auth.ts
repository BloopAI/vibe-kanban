import { redirect, type ParsedLocation } from "@tanstack/react-router";
import { isLoggedIn } from "@remote/shared/lib/auth";

type RouteLocation = Pick<ParsedLocation, "pathname" | "searchStr" | "hash">;

function toNextPath({ pathname, searchStr, hash }: RouteLocation): string {
  return `${pathname}${searchStr}${hash}`;
}

export async function requireAuthenticated(location: RouteLocation) {
  if (await isLoggedIn()) {
    return;
  }

  throw redirect({
    to: "/account",
    search: {
      next: toNextPath(location),
    },
  });
}

export async function redirectAuthenticatedToHome() {
  if (await isLoggedIn()) {
    throw redirect({ to: "/" });
  }
}
