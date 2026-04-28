# GitHub 构建与本地 NPX 使用流程

这份文档用于维护本 fork 的 Windows 构建、下载、本地 NPX 安装和后续 npm 发布流程。

当前目标：通过 GitHub Actions 构建 Windows x64 可用包；下载 `.tgz` 后在 Windows 本地用 `npx` 启动；本地运行不依赖远程服务器、不要求登录，项目、看板和 issue 数据存放在本机 SQLite。

## 当前版本

当前 fork 版本：

```text
0.1.44-toby.5
```

版本规则使用 `-toby` 后缀：

```text
0.1.44-toby.1
0.1.44-toby.2
0.1.45-toby.0
```

发包前保持这些文件中的版本一致：

- `package.json`
- `packages/local-web/package.json`
- `npx-cli/package.json`
- `npx-cli/package-lock.json`

当前 npm 包名：

```text
@toby/vibe-kanban
```

安装后的命令仍然是：

```text
vibe-kanban
```

## 已修复的问题

上游提交 `97123d52` 把项目页改成了 export-only 页面，导致本地运行 `npx vibe-kanban` 时也会看到：

```text
Project sunset
Project functionality has been retired
```

本 fork 已恢复真实 Kanban 页面，并移除了本地界面里的 cloud shutdown/export 横幅。

后续又完成了本地化改造：

- 本地运行时默认视为已登录本地用户。
- 组织、项目、状态、issue、标签、关联、评论等 Kanban 数据走本机 SQLite。
- 前端原远程 `/v1/...` 请求在本地版中改写到 `/api/local/v1/...`。
- Electric 同步在本地版中直接走本地 fallback，不再等待远程 token 或远程 shape 服务。

这意味着本地版的目标使用方式是：一个 `npx` 启动本机服务和网页 UI，数据在本机，不依赖外部服务器。

## 当前本地化范围

已经改成本地 SQLite 的核心数据：

- 固定本地用户和本地组织。
- 项目、项目排序、项目状态。
- issue、优先级、父子关系、排序、描述等字段。
- 标签、issue 标签、负责人、关注者、issue 关联。
- issue 评论和评论 reaction。
- 工作区与项目/issue 的本地链接。
- Electric shape 在本地包里走 `/api/local/v1/fallback/...`，不需要远程 Electric 服务。

仍属于后续可继续本地化的范围：

- issue/comment 附件上传目前仍沿用远程附件接口设计，完整离线附件需要单独接到本机文件存储。
- PR、relay、云主机、组织计费、邀请等云功能不是本地 NPX 的核心路径。

因此当前版本的目标是让项目、看板、issue、评论和工作区流程在本地可用；如果后续要做到“附件也完全本地”，下一阶段应优先改造附件 API。

## 在 GitHub 上构建 Windows 包

1. 把当前分支 push 到 GitHub。
2. 打开 GitHub 仓库页面。
3. 进入 `Actions`。
4. 选择并运行 `Build Toby NPX Windows Package`。
5. 等待 `Windows x64 NPX package` job 完成。
6. 下载 artifact：`toby-vibe-kanban-windows-x64-npx`。

下载后的 artifact 中应包含：

- `toby-vibe-kanban-0.1.44-toby.5.tgz`
- `dist/windows-x64/vibe-kanban.zip`
- `dist/windows-x64/vibe-kanban-mcp.zip`
- `dist/windows-x64/vibe-kanban-review.zip`

其中 `.tgz` 是推荐的本地验证方式。它已经包含 Windows zip 文件，所以本地测试不依赖 R2，也不依赖上游 Bloop 的 secrets。

## Windows 本地用 NPX 运行

解压从 GitHub Actions 下载的 artifact，然后进入解压目录：

```powershell
cd .\toby-vibe-kanban-windows-x64-npx
Get-Item .\toby-vibe-kanban-0.1.44-toby.5.tgz
```

运行：

```powershell
node -v
$pkg = Resolve-Path .\toby-vibe-kanban-0.1.44-toby.5.tgz
npx --yes --package "$pkg" vibe-kanban
```

Node 版本需要是 `20.19.0` 或更高。

建议每次验证新包前先关闭旧实例，避免浏览器还停留在旧端口或旧 Tauri 桌面版：

```powershell
Get-Process vibe-kanban,vibe-kanban-tauri -ErrorAction SilentlyContinue | Stop-Process
```

启动后以新打开的浏览器地址为准。可以访问下面的地址检查当前实例是否是真本地模式：

```powershell
Invoke-RestMethod http://127.0.0.1:<端口>/api/info | Select-Object -ExpandProperty data | Select-Object version,shared_api_base,login_status
```

其中 `shared_api_base` 应该为空；如果是 `https://api.vibekanban.com`，说明当前窗口仍在使用旧的远程/桌面实例。

如果从仓库根目录直接运行：

```powershell
$pkg = Resolve-Path .\toby-vibe-kanban-windows-x64-npx\toby-vibe-kanban-0.1.44-toby.5.tgz
npx --yes --package "$pkg" vibe-kanban
```

全局安装：

```powershell
$pkg = Resolve-Path .\toby-vibe-kanban-0.1.44-toby.5.tgz
npm install -g "$pkg"
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

推荐优先测试 NPX 路径，因为这更接近最终用户实际使用方式。

## 本地日志与排查

普通启动时，后端日志会输出到运行 `npx` 的 PowerShell 窗口。需要更详细日志时：

```powershell
$env:RUST_LOG = "debug"
$env:VIBE_KANBAN_DEBUG = "1"
$pkg = Resolve-Path .\toby-vibe-kanban-0.1.44-toby.5.tgz
npx --yes --package "$pkg" vibe-kanban
```

本地数据目录在：

```powershell
$env:APPDATA\bloop\vibe-kanban\data
```

关键文件：

- `db.v2.sqlite`：本地 SQLite 数据库。
- `config.json`：本地配置。
- `sessions/`：工作区和 agent 会话相关数据。agent 执行日志在 `sessions/<session-id前两位>/<session-id>/processes/<process-id>.jsonl`。

从 `0.1.44-toby.4` 开始，如果 Codex agent 在初始化阶段失败，`LaunchError` 会额外写入 `Codex launch context`，其中包含实际启动的可执行文件、参数、工作目录、Codex 配置文件路径、模型和 provider。看到类似 `'openai' 不是内部或外部命令` 时，优先对照这段上下文判断是 Vibe Kanban 启动命令问题，还是 Codex 配置/MCP 子进程里的命令问题。

从 `0.1.44-toby.5` 开始，默认 Codex 启动命令改为显式 bin 形式：`npx -y --package @openai/codex@0.124.0 codex app-server`。这可以避免 Windows 嵌套 NPX 环境下 npm 推断 bin 名称时走到错误的 `openai` 命令。

如果前端只显示类似 `Failed to create Project` 或 `Failed to create Issue`，优先打开浏览器开发者工具的 Network 面板，看失败请求的 HTTP 状态码。`415 Unsupported Media Type` 通常表示请求缺少 JSON `Content-Type`；`403 Forbidden` 通常表示当前页面端口不是后端允许的同源地址，常见于手动用 Vite dev server 代理到已运行的生产后端。

## 本地功能闭环自检

每次下载新的 GitHub Actions 构建包后，建议按这个顺序验证：

1. 关闭旧实例，重新运行新的 `.tgz`。
2. 打开 `/api/info`，确认 `shared_api_base` 为空。
3. 创建 Project。
4. 进入 Project 创建 Issue。
5. 拖动 Issue 到其他状态，确认状态能保存。
6. 从 Issue 创建 Workspace，选择本地仓库、分支和 agent。
7. 发送一条简单 prompt，确认 Workspace 创建成功、agent 有执行记录。

如果第 3 到第 5 步失败，通常是本地看板数据 API 问题，先看 Network 面板中的 `/api/local/v1/...` 请求。
如果第 6 到第 7 步失败，通常是本地 workspace/agent 链路问题，先看 PowerShell 启动窗口日志，再看本地数据目录下的 `sessions/.../processes/*.jsonl`。

## 可选：发布到 npm

只有在本地确认 `.tgz` 可以正常运行后，再发布到 npm：

```powershell
npm login
npm publish .\toby-vibe-kanban-0.1.44-toby.5.tgz --access public
```

发布成功后，用户可以运行：

```powershell
npx --yes --package @toby/vibe-kanban vibe-kanban
```

如果希望以后支持更短命令：

```powershell
npx @toby/vibe-kanban
```

需要在真实 npm 发布后再验证一次。当前文档推荐使用 `--package` 形式，因为 package 名是 `@toby/vibe-kanban`，实际 bin 命令是 `vibe-kanban`，显式写法更稳定。

## Workflow 范围

新增 workflow 文件：

```text
.github/workflows/toby-npx-windows.yml
```

目前只构建 Windows x64：

```text
x86_64-pc-windows-msvc
```

如果以后要支持 Windows ARM64，可以基于当前 workflow 增加目标：

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
- 本地 Windows 直接跑完整 Rust 构建需要安装 Rust、cargo 和对应 Windows 编译工具链；推荐优先使用 GitHub Actions 构建。
- 如果 GitHub Actions 报 `x86_64-pc-windows-msvc target may not be installed`，确认 workflow 里有 `rustup target add x86_64-pc-windows-msvc` 或等价的 target 安装步骤。
