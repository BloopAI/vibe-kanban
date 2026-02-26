import { RemoteUserSystemProvider } from "@remote/app/providers/RemoteUserSystemProvider";
import { ProjectKanban } from "@/pages/kanban/ProjectKanban";

export function RemoteProjectKanbanShell() {
  return (
    <RemoteUserSystemProvider>
      <ProjectKanban />
    </RemoteUserSystemProvider>
  );
}
