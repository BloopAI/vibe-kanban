import { useMemo } from "react";
import { useLocation } from "@tanstack/react-router";
import { Navbar } from "@vibe/ui/components/Navbar";

interface RemoteNavbarContainerProps {
  organizationName: string | null;
}

export function RemoteNavbarContainer({
  organizationName,
}: RemoteNavbarContainerProps) {
  const location = useLocation();

  const workspaceTitle = useMemo(() => {
    if (location.pathname.startsWith("/projects/")) {
      return organizationName ?? "Project";
    }

    if (location.pathname.startsWith("/workspaces")) {
      return "Workspaces";
    }

    return "Organizations";
  }, [location.pathname, organizationName]);

  return <Navbar workspaceTitle={workspaceTitle} />;
}
