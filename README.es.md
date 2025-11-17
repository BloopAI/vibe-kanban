<p align="center">
  <a href="https://vibekanban.com">
    <picture>
      <source srcset="frontend/public/vibe-kanban-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="frontend/public/vibe-kanban-logo.svg" media="(prefers-color-scheme: light)">
      <img src="frontend/public/vibe-kanban-logo.svg" alt="Logo de Vibe Kanban">
    </picture>
  </a>
</p>

<p align="center">Obtén 10 veces más de Claude Code, Gemini CLI, Codex, Amp y otros agentes de codificación...</p>
<p align="center">
  <a href="https://www.npmjs.com/package/vibe-kanban"><img alt="npm" src="https://img.shields.io/npm/v/vibe-kanban?style=flat-square" /></a>
  <a href="https://github.com/BloopAI/vibe-kanban/blob/main/.github/workflows/publish.yml"><img alt="Estado de compilación" src="https://img.shields.io/github/actions/workflow/status/BloopAI/vibe-kanban/.github%2Fworkflows%2Fpublish.yml" /></a>
  <a href="https://deepwiki.com/BloopAI/vibe-kanban"><img src="https://deepwiki.com/badge.svg" alt="Pregunta a DeepWiki"></a>
</p>

![](frontend/public/vibe-kanban-screenshot-overview.png)

## Descripción General

Los agentes de codificación con IA escriben cada vez más el código del mundo y los ingenieros humanos ahora pasan la mayoría de su tiempo planificando, revisando y orquestando tareas. Vibe Kanban agiliza este proceso, permitiéndote:

- Cambiar fácilmente entre diferentes agentes de codificación
- Orquestar la ejecución de múltiples agentes de codificación en paralelo o en secuencia
- Revisar rápidamente el trabajo e iniciar servidores de desarrollo
- Hacer seguimiento del estado de las tareas en las que trabajan tus agentes de codificación
- Centralizar la configuración de los MCP de los agentes de codificación
- Abrir proyectos remotamente vía SSH cuando se ejecuta Vibe Kanban en un servidor remoto

Puedes ver un vídeo de descripción general [aquí](https://youtu.be/TFT3KnZOOAk).

## Instalación

Asegúrate de haberte autenticado con tu agente de codificación favorito. Una lista completa de agentes de codificación compatibles se encuentra en la [documentación](https://vibekanban.com/docs). Luego, en tu terminal ejecuta:

```bash
npx vibe-kanban
```

## Documentación

Por favor, dirígete al [sitio web](https://vibekanban.com/docs) para la documentación más reciente y guías de usuario.

## Soporte

Utilizamos [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions) para solicitudes de funcionalidades. Por favor, abre una discusión para crear una solicitud de funcionalidad. Para errores, por favor abre un issue en este repositorio.

## Contribuciones

Preferimos que las ideas y cambios se discutan primero con el equipo principal a través de [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions) o Discord, donde podemos discutir detalles de implementación y alineación con la hoja de ruta existente. Por favor, no abras PRs sin antes discutir tu propuesta con el equipo.

## Desarrollo

### Requisitos Previos

- [Rust](https://rustup.rs/) (última versión estable)
- [Node.js](https://nodejs.org/) (>=18)
- [pnpm](https://pnpm.io/) (>=8)

Herramientas de desarrollo adicionales:
```bash
cargo install cargo-watch
cargo install sqlx-cli
```

Instalar dependencias:
```bash
pnpm i
```

### Ejecutar el servidor de desarrollo

```bash
pnpm run dev
```

Esto iniciará el backend. Se copiará una base de datos vacía desde la carpeta `dev_assets_seed`.

### Compilar el frontend

Para compilar solo el frontend:

```bash
cd frontend
pnpm build
```

### Compilar desde el código fuente

1. Ejecuta `build-npm-package.sh`
2. En la carpeta `npx-cli` ejecuta `npm pack`
3. Puedes ejecutar tu compilación con `npx [ARCHIVO GENERADO].tgz`


### Variables de Entorno

Las siguientes variables de entorno se pueden configurar en tiempo de compilación o ejecución:

| Variable | Tipo | Predeterminado | Descripción |
|----------|------|----------------|-------------|
| `POSTHOG_API_KEY` | Tiempo de compilación | Vacío | Clave de API de PostHog analytics (desactiva analytics si está vacío) |
| `POSTHOG_API_ENDPOINT` | Tiempo de compilación | Vacío | Endpoint de analytics de PostHog (desactiva analytics si está vacío) |
| `BACKEND_PORT` | Tiempo de ejecución | `0` (asignación automática) | Puerto del servidor backend |
| `FRONTEND_PORT` | Tiempo de ejecución | `3000` | Puerto del servidor de desarrollo del frontend |
| `HOST` | Tiempo de ejecución | `127.0.0.1` | Host del servidor backend |
| `DISABLE_WORKTREE_ORPHAN_CLEANUP` | Tiempo de ejecución | No establecido | Desactiva la limpieza de worktree de git (para depuración) |

**Las variables de tiempo de compilación** deben establecerse al ejecutar `pnpm run build`. **Las variables de tiempo de ejecución** se leen cuando la aplicación se inicia.

### Despliegue Remoto

Cuando ejecutes Vibe Kanban en un servidor remoto (por ejemplo, vía systemctl, Docker o alojamiento en la nube), puedes configurar tu editor para abrir proyectos vía SSH:

1. **Acceso vía túnel**: Usa Cloudflare Tunnel, ngrok o similar para exponer la interfaz web
2. **Configura SSH remoto** en Configuración → Integración de Editor:
   - Establece **Remote SSH Host** a tu nombre de host del servidor o IP
   - Establece **Remote SSH User** a tu nombre de usuario SSH (opcional)
3. **Requisitos previos**:
   - Acceso SSH desde tu máquina local al servidor remoto
   - Claves SSH configuradas (autenticación sin contraseña)
   - Extensión VSCode Remote-SSH

Cuando esté configurado, los botones "Abrir en VSCode" generarán URLs como `vscode://vscode-remote/ssh-remote+user@host/path` que abren tu editor local y se conectan al servidor remoto.

Consulta la [documentación](https://vibekanban.com/docs/configuration-customisation/global-settings#remote-ssh-configuration) para instrucciones detalladas de configuración.
