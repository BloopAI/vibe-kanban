export const LAUNCHD_LABEL = 'com.vibekanban.server';
export const LAUNCHD_PLIST_PATH = `${process.env.HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`;

export function generateLaunchdPlist(
  binPath: string,
  host: string,
  port: string,
  logPath: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binPath}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOST</key>
    <string>${host}</string>
    <key>BACKEND_PORT</key>
    <string>${port}</string>
    <key>VIBE_KANBAN_NO_BROWSER</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>`;
}
