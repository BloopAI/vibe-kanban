# GitHub 构建与本地 NPX 安装流程

这份文档用于维护本 fork 的 Windows 构建、下载、本地 NPX 安装和后续 npm 发布流程。

当前目标是：先通过 GitHub Actions 构建 Windows 可用包，在本地验证 `.tgz` 和 zip 包可用，然后再决定是否发布到 npm。

## 已修复的问题

上游提交 `97123d52` 把项目页改成了 export-only 页面。具体表现是 `ProjectKanban` 不再渲染真实看板，而是直接渲染 `ProjectSunsetPage`，因此本地运行 `npx vibe-kanban` 时也会看到：

```text
Project sunset
Project functionality has been retired
```

本 fork 已恢复本地项目页链路：

- `packages/local-web/src/routes/_app.projects.$projectId.tsx`
- `packages/web-core/src/pages/kanban/LocalProjectKanban.tsx`
- `packages/web-core/src/pages/kanban/ProjectKanban.tsx`

同时移除了 shared app layout 中的 cloud shutdown/export 横幅，避免本地项目页继续被引导到导出模式。

## 版本规则

本 fork 使用 `-toby` 预发布后缀：

```text
0.1.44-toby.0
0.1.44-toby.1
0.1.45-toby.0
```

发布 NPX 包时，保持以下文件中的版本一致：

- `package.json`
- `packages/local-web/package.json`
- `npx-cli/package.json`
- `npx-cli/package-lock.json`

当前 scoped npm 包名是：

```text
@toby/vibe-kanban
```

包安装后的命令仍然是：

```text
vibe-kanban
```

## 在 GitHub 上构建 Windows 包

1. 把当前分支 push 到 GitHub。
2. 打开 GitHub 仓库页面。
3. 进入 `Actions`。
4. 选择并运行 `Build Toby NPX Windows Package`。
5. 等待 `Windows x64 NPX package` job 完成。
6. 下载 artifact：`toby-vibe-kanban-windows-x64-npx`。

下载后的 artifact 中应包含：

- `toby-vibe-kanban-0.1.44-toby.0.tgz`
- `dist/windows-x64/vibe-kanban.zip`
- `dist/windows-x64/vibe-kanban-mcp.zip`
- `dist/windows-x64/vibe-kanban-review.zip`

其中 `.tgz` 是最推荐的本地验证方式。它已经包含 Windows zip 文件，因此本地测试时不依赖 R2，也不依赖 Bloop 的 secrets。

## 在 Windows 本地用 NPX 运行

解压从 GitHub Actions 下载的 artifact，然后在该目录打开 PowerShell：

```powershell
node -v
npx --yes --package .\toby-vibe-kanban-0.1.44-toby.0.tgz vibe-kanban
```

Node 版本需要是 `20.19.0` 或更高。

如果想全局安装：

```powershell
npm install -g .\toby-vibe-kanban-0.1.44-toby.0.tgz
vibe-kanban
```

卸载全局安装：

```powershell
npm uninstall -g @toby/vibe-kanban
```

## 直接运行 Windows 二进制

如果只想测试生成出来的 Windows exe：

```powershell
Expand-Archive .\dist\windows-x64\vibe-kanban.zip -DestinationPath .\vk-bin -Force
.\vk-bin\vibe-kanban.exe
```

但推荐优先测试 NPX 路径，因为这更接近最终用户实际使用方式。

## 可选：发布到 npm

只有在本地确认 `.tgz` 能正常运行后，再发布到 npm：

```powershell
npm login
npm publish .\toby-vibe-kanban-0.1.44-toby.0.tgz --access public
```

发布成功后，用户可以运行：

```powershell
npx --yes --package @toby/vibe-kanban vibe-kanban
```

如果你希望以后支持更短的命令：

```powershell
npx @toby/vibe-kanban
```

需要在真实 npm 发布后再验证一次。当前文档推荐使用 `--package` 形式，因为 package 名称是 `@toby/vibe-kanban`，实际 bin 命令是 `vibe-kanban`，显式写法更稳定。

## 当前 workflow 的范围

新增 workflow 文件：

```text
.github/workflows/toby-npx-windows.yml
```

它目前只构建 Windows x64：

```text
x86_64-pc-windows-msvc
```

如果以后要支持 Windows ARM64，可以基于当前 workflow 增加一个目标：

```text
aarch64-pc-windows-msvc
```

并把产物目录命名为：

```text
windows-arm64
```

## 注意事项

- 现有上游发布 workflow 仍依赖 Bloop 自有的 R2、Sentry、deploy key 等 secrets。
- 本 fork 新增的 `Build Toby NPX Windows Package` workflow 不依赖 Bloop 的 R2。
- `packages/local-web/vite.config.ts` 已改为仅在存在 `SENTRY_AUTH_TOKEN` 时启用 Sentry Vite 插件。
- 本地 Windows 直接跑完整 Rust 构建需要安装 Rust、cargo 和对应 Windows 编译工具链；推荐优先使用 GitHub Actions 构建。
