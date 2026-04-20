export const SYSTEMD_SERVICE_NAME = 'vibe-kanban';
export const SYSTEMD_UNIT_PATH = `${process.env.HOME}/.config/systemd/user/${SYSTEMD_SERVICE_NAME}.service`;

export function generateSystemdUnit(
  binPath: string,
  host: string,
  port: string,
  logPath: string,
): string {
  return `[Unit]
Description=Agent Kanban Server
After=network.target

[Service]
ExecStart=${binPath}
Environment=HOST=${host}
Environment=BACKEND_PORT=${port}
Environment=VIBE_KANBAN_NO_BROWSER=1
Restart=always
RestartSec=3
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target`;
}
