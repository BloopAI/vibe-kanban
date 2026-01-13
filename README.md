<p align="center">
  <a href="https://vibekanban.com">
    <picture>
      <source srcset="frontend/public/vibe-kanban-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="frontend/public/vibe-kanban-logo.svg" media="(prefers-color-scheme: light)">
      <img src="frontend/public/vibe-kanban-logo.svg" alt="Logo Vibe Kanban">
    </picture>
  </a>
</p>

<p align="center">Tirez 10X plus de Claude Code, Gemini CLI, Codex, Amp et d'autres agents de codage...</p>
<p align="center">
  <a href="https://www.npmjs.com/package/vibe-kanban"><img alt="npm" src="https://img.shields.io/npm/v/vibe-kanban?style=flat-square" /></a>
  <a href="https://github.com/BloopAI/vibe-kanban/blob/main/.github/workflows/publish.yml"><img alt="Statut de build" src="https://img.shields.io/github/actions/workflow/status/BloopAI/vibe-kanban/.github%2Fworkflows%2Fpublish.yml" /></a>
  <a href="https://deepwiki.com/BloopAI/vibe-kanban"><img src="https://deepwiki.com/badge.svg" alt="Demander à DeepWiki"></a>
</p>

<h1 align="center">
  <a href="https://jobs.polymer.co/vibe-kanban?source=github"><strong>Nous recrutons !</strong></a>
</h1>

![](frontend/public/vibe-kanban-screenshot-overview.png)

## Aperçu

Les agents de codage IA écrivent de plus en plus le code du monde et les ingénieurs humains passent désormais la majorité de leur temps à planifier, réviser et orchestrer des tâches. Vibe Kanban simplifie ce processus, vous permettant de :

- Basculer facilement entre différents agents de codage
- Orchestrer l'exécution de plusieurs agents de codage en parallèle ou en séquence
- Réviser rapidement le travail et démarrer des serveurs de développement
- Suivre le statut des tâches sur lesquelles vos agents de codage travaillent
- Centraliser la configuration des configs MCP des agents de codage
- Ouvrir des projets à distance via SSH lorsque Vibe Kanban fonctionne sur un serveur distant

Vous pouvez regarder une vidéo de présentation [ici](https://youtu.be/TFT3KnZOOAk).

## Installation

Assurez-vous d'être authentifié avec votre agent de codage préféré. Une liste complète des agents de codage pris en charge se trouve dans la [documentation](https://vibekanban.com/docs). Ensuite, dans votre terminal, exécutez :

```bash
npx vibe-kanban
```

## Documentation

Veuillez consulter le [site web](https://vibekanban.com/docs) pour la documentation la plus récente et les guides d'utilisation.

## Support

Nous utilisons les [Discussions GitHub](https://github.com/BloopAI/vibe-kanban/discussions) pour les demandes de fonctionnalités. Veuillez ouvrir une discussion pour créer une demande de fonctionnalité. Pour les bugs, veuillez ouvrir une issue sur ce dépôt.

## Contribuer

Nous préférons que les idées et les changements soient d'abord soumis à l'équipe principale via les [Discussions GitHub](https://github.com/BloopAI/vibe-kanban/discussions) ou [Discord](https://discord.gg/AC4nwVtJM3), où nous pouvons discuter des détails d'implémentation et de l'alignement avec la feuille de route existante. Veuillez ne pas ouvrir de PRs sans avoir d'abord discuté de votre proposition avec l'équipe.

## Développement

### Prérequis

- [Rust](https://rustup.rs/) (dernière version stable)
- [Node.js](https://nodejs.org/) (>=18)
- [pnpm](https://pnpm.io/) (>=8)

Outils de développement supplémentaires :
```bash
cargo install cargo-watch
cargo install sqlx-cli
```

Installer les dépendances :
```bash
pnpm i
```

### Lancer le serveur de développement

```bash
pnpm run dev
```

Cela démarrera le backend. Une base de données vide sera copiée depuis le dossier `dev_assets_seed`.

### Compiler le frontend

Pour compiler uniquement le frontend :

```bash
cd frontend
pnpm build
```

### Compiler depuis les sources (macOS)

1. Exécutez `./local-build.sh`
2. Testez avec `cd npx-cli && node bin/cli.js`


### Variables d'environnement

Les variables d'environnement suivantes peuvent être configurées au moment de la compilation ou à l'exécution :

| Variable | Type | Défaut | Description |
|----------|------|--------|-------------|
| `POSTHOG_API_KEY` | Compilation | Vide | Clé API PostHog analytics (désactive les analytics si vide) |
| `POSTHOG_API_ENDPOINT` | Compilation | Vide | Point de terminaison PostHog analytics (désactive les analytics si vide) |
| `PORT` | Exécution | Auto-assigné | **Production** : Port du serveur. **Dev** : Port du frontend (le backend utilise PORT+1) |
| `BACKEND_PORT` | Exécution | `0` (auto-assigné) | Port du serveur backend (mode dev uniquement, remplace PORT+1) |
| `FRONTEND_PORT` | Exécution | `3000` | Port du serveur de dev frontend (mode dev uniquement, remplace PORT) |
| `HOST` | Exécution | `127.0.0.1` | Hôte du serveur backend |
| `DISABLE_WORKTREE_ORPHAN_CLEANUP` | Exécution | Non défini | Désactive le nettoyage des worktrees git (pour le débogage) |

**Les variables de compilation** doivent être définies lors de l'exécution de `pnpm run build`. **Les variables d'exécution** sont lues au démarrage de l'application.

### Déploiement distant

Lorsque vous exécutez Vibe Kanban sur un serveur distant (par exemple via systemctl, Docker ou l'hébergement cloud), vous pouvez configurer votre éditeur pour ouvrir des projets via SSH :

1. **Accès via tunnel** : Utilisez Cloudflare Tunnel, ngrok ou similaire pour exposer l'interface web
2. **Configurer le SSH distant** dans Paramètres → Intégration éditeur :
   - Définissez **Hôte SSH distant** sur le nom d'hôte ou l'IP de votre serveur
   - Définissez **Utilisateur SSH distant** sur votre nom d'utilisateur SSH (optionnel)
3. **Prérequis** :
   - Accès SSH depuis votre machine locale vers le serveur distant
   - Clés SSH configurées (authentification sans mot de passe)
   - Extension VSCode Remote-SSH

Une fois configuré, les boutons "Ouvrir dans VSCode" généreront des URLs comme `vscode://vscode-remote/ssh-remote+user@host/path` qui ouvriront votre éditeur local et se connecteront au serveur distant.

Consultez la [documentation](https://vibekanban.com/docs/configuration-customisation/global-settings#remote-ssh-configuration) pour des instructions de configuration détaillées.
