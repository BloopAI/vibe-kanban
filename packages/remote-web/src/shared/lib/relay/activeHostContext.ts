import { getRelayActiveHostOverride } from "@/shared/lib/relayActiveHostOverride";

let activeRelayHostId: string | null = null;

export function setActiveRelayHostId(hostId: string | null): void {
  activeRelayHostId = hostId;
}

export function getActiveRelayHostId(): string | null {
  return getRelayActiveHostOverride() ?? activeRelayHostId;
}
