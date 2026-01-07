import { EventClient } from "@tanstack/devtools-event-client";
class FormEventClient extends EventClient {
  constructor() {
    super({
      pluginId: "form-devtools",
      reconnectEveryMs: 1e3
    });
  }
}
const formEventClient = new FormEventClient();
export {
  formEventClient
};
//# sourceMappingURL=EventClient.js.map
