<p align="center">
  <a href="https://vibekanban.com">
    <picture>
      <source srcset="frontend/public/vibe-kanban-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="frontend/public/vibe-kanban-logo.svg" media="(prefers-color-scheme: light)">
      <img src="frontend/public/vibe-kanban-logo.svg" alt="Vibe Kanban Logo">
    </picture>
  </a>
</p>

<p align="center">Holen Sie 10X mehr aus Claude Code, Gemini CLI, Codex, Amp und anderen Coding-Agenten heraus...</p>
<p align="center">
  <a href="https://www.npmjs.com/package/vibe-kanban"><img alt="npm" src="https://img.shields.io/npm/v/vibe-kanban?style=flat-square" /></a>
  <a href="https://github.com/BloopAI/vibe-kanban/blob/main/.github/workflows/publish.yml"><img alt="Build-Status" src="https://img.shields.io/github/actions/workflow/status/BloopAI/vibe-kanban/.github%2Fworkflows%2Fpublish.yml" /></a>
  <a href="https://deepwiki.com/BloopAI/vibe-kanban"><img src="https://deepwiki.com/badge.svg" alt="Fragen Sie DeepWiki"></a>
</p>

<h1 align="center">
  <a href="https://jobs.polymer.co/vibe-kanban?source=github"><strong>Wir stellen ein!</strong></a>
</h1>

![](frontend/public/vibe-kanban-screenshot-overview.png)

## Überblick

KI-Coding-Agenten schreiben zunehmend den Code der Welt und menschliche Entwickler verbringen nun den Großteil ihrer Zeit mit Planung, Überprüfung und Orchestrierung von Aufgaben. Vibe Kanban optimiert diesen Prozess und ermöglicht es Ihnen:

- Einfach zwischen verschiedenen Coding-Agenten zu wechseln
- Die Ausführung mehrerer Coding-Agenten parallel oder sequentiell zu orchestrieren
- Arbeit schnell zu überprüfen und Entwicklungsserver zu starten
- Den Status von Aufgaben zu verfolgen, an denen Ihre Coding-Agenten arbeiten
- MCP-Konfigurationen für Coding-Agenten zentral zu verwalten
- Projekte remote via SSH zu öffnen, wenn Vibe Kanban auf einem Remote-Server läuft

Sie können sich eine Videoübersicht [hier](https://youtu.be/TFT3KnZOOAk) ansehen.

## Installation

Stellen Sie sicher, dass Sie sich bei Ihrem bevorzugten Coding-Agenten authentifiziert haben. Eine vollständige Liste der unterstützten Coding-Agenten finden Sie in der [Dokumentation](https://vibekanban.com/docs). Führen Sie dann in Ihrem Terminal aus:

```bash
npx vibe-kanban
```

## Dokumentation

Bitte besuchen Sie die [Website](https://vibekanban.com/docs) für die neueste Dokumentation und Benutzerhandbücher.

## Support

Wir verwenden [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions) für Feature-Anfragen. Bitte eröffnen Sie eine Diskussion, um eine Feature-Anfrage zu erstellen. Für Fehler öffnen Sie bitte ein Issue in diesem Repository.

## Mitwirken

Wir bevorzugen, dass Ideen und Änderungen zuerst über [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions) oder [Discord](https://discord.gg/AC4nwVtJM3) mit dem Kernteam besprochen werden, wo wir Implementierungsdetails und die Ausrichtung mit der bestehenden Roadmap diskutieren können. Bitte öffnen Sie keine PRs, ohne Ihren Vorschlag vorher mit dem Team besprochen zu haben.

## Entwicklung

### Voraussetzungen

- [Rust](https://rustup.rs/) (neueste stabile Version)
- [Node.js](https://nodejs.org/) (>=18)
- [pnpm](https://pnpm.io/) (>=8)

Zusätzliche Entwicklungstools:
```bash
cargo install cargo-watch
cargo install sqlx-cli
```

Abhängigkeiten installieren:
```bash
pnpm i
```

### Entwicklungsserver starten

```bash
pnpm run dev
```

Dies startet das Backend. Eine leere Datenbank wird aus dem Ordner `dev_assets_seed` kopiert.

### Frontend bauen

Um nur das Frontend zu bauen:

```bash
cd frontend
pnpm build
```

### Aus Quellcode bauen

1. Führen Sie `build-npm-package.sh` aus
2. Im Ordner `npx-cli` führen Sie `npm pack` aus
3. Sie können Ihren Build mit `npx [GENERIERTE DATEI].tgz` ausführen


### Umgebungsvariablen

Die folgenden Umgebungsvariablen können zur Build-Zeit oder zur Laufzeit konfiguriert werden:

| Variable | Typ | Standard | Beschreibung |
|----------|-----|----------|--------------|
| `POSTHOG_API_KEY` | Build-Zeit | Leer | PostHog-Analytics-API-Schlüssel (deaktiviert Analytics wenn leer) |
| `POSTHOG_API_ENDPOINT` | Build-Zeit | Leer | PostHog-Analytics-Endpunkt (deaktiviert Analytics wenn leer) |
| `PORT` | Laufzeit | Auto-Zuweisung | **Produktion**: Server-Port. **Entwicklung**: Frontend-Port (Backend verwendet PORT+1) |
| `BACKEND_PORT` | Laufzeit | `0` (Auto-Zuweisung) | Backend-Server-Port (nur Entwicklungsmodus, überschreibt PORT+1) |
| `FRONTEND_PORT` | Laufzeit | `3000` | Frontend-Entwicklungsserver-Port (nur Entwicklungsmodus, überschreibt PORT) |
| `HOST` | Laufzeit | `127.0.0.1` | Backend-Server-Host |
| `DISABLE_WORKTREE_ORPHAN_CLEANUP` | Laufzeit | Nicht gesetzt | Deaktiviert Git-Worktree-Bereinigung (zum Debuggen) |

**Build-Zeit-Variablen** müssen beim Ausführen von `pnpm run build` gesetzt werden. **Laufzeit-Variablen** werden beim Start der Anwendung gelesen.

### Remote-Bereitstellung

Wenn Sie Vibe Kanban auf einem Remote-Server ausführen (z.B. über systemctl, Docker oder Cloud-Hosting), können Sie Ihren Editor so konfigurieren, dass Projekte via SSH geöffnet werden:

1. **Zugriff über Tunnel**: Verwenden Sie Cloudflare Tunnel, ngrok oder ähnliches, um die Web-Oberfläche bereitzustellen
2. **Remote-SSH konfigurieren** in Einstellungen → Editor-Integration:
   - Setzen Sie **Remote-SSH-Host** auf Ihren Server-Hostnamen oder IP
   - Setzen Sie **Remote-SSH-Benutzer** auf Ihren SSH-Benutzernamen (optional)
3. **Voraussetzungen**:
   - SSH-Zugriff von Ihrem lokalen Rechner auf den Remote-Server
   - SSH-Schlüssel konfiguriert (passwortlose Authentifizierung)
   - VSCode Remote-SSH-Erweiterung

Bei Konfiguration generieren die "In VSCode öffnen"-Schaltflächen URLs wie `vscode://vscode-remote/ssh-remote+user@host/path`, die Ihren lokalen Editor öffnen und sich mit dem Remote-Server verbinden.

Siehe die [Dokumentation](https://vibekanban.com/docs/configuration-customisation/global-settings#remote-ssh-configuration) für detaillierte Einrichtungsanweisungen.
