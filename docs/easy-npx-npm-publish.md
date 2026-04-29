# Easy NPX npm 发布流程

本文档用于维护 `easy-vibe-kanban` 的 GitHub Actions 自动发布流程。

## 推荐发布方式

使用 npm Trusted Publishing，不在 GitHub Secrets 中保存长期 npm token。

对应 workflow：

```text
.github/workflows/publish-easy-npx.yml
```

这个 workflow 会完成：

1. 构建 Windows x64 后端二进制。
2. 构建本地 Web 前端。
3. 打包 `npx-cli/dist/windows-x64/*.zip`。
4. 临时更新 `npx-cli/package.json` 的 npm 版本号。
5. 执行 `npm pack`。
6. 使用 npm Trusted Publishing 发布到 npm registry。
7. 上传 `.tgz` 和 Windows zip 作为 GitHub artifact。

## npm 后台配置

首次使用前，需要在 npm 网站中配置 trusted publisher。

包名：

```text
easy-vibe-kanban
```

在 npm package settings 中添加 GitHub Actions trusted publisher：

```text
Repository owner: toby1123yjh
Repository name: vibe-kanban
Workflow filename: publish-easy-npx.yml
Environment name: 留空
```

当前 workflow 没有配置 GitHub environment。如果后续想加发布审批，可以在 GitHub 里创建例如 `npm` environment，并同步把 npm trusted publisher 的 Environment name 改成同一个值。

## 手动发布步骤

1. 打开 GitHub 仓库。
2. 进入 `Actions`。
3. 选择 `Publish Easy NPX to npm`。
4. 点击 `Run workflow`。
5. 填写参数：

```text
version: 0.1.44-easy.1
npm_tag: latest
publish_mode: publish
```

建议每次正式发布前，先用：

```text
publish_mode: dry-run
```

确认打包流程无误后，再重新执行一次 `publish`。

## 版本号规则

npm 不允许重复发布同一个 `name@version`。已经发布过的版本号不能再使用。

推荐规则：

```text
0.1.44-easy.0
0.1.44-easy.1
0.1.44-easy.2
0.1.45-easy.0
```

如果只改 npm 包发布流程或 Windows 包装逻辑，可以递增 `-easy.N`。

如果跟随上游升级基础版本，可以递增基础版本号，例如从 `0.1.44-easy.N` 到 `0.1.45-easy.0`。

## 发布后验证

强制使用 npm 官方源验证：

```powershell
npx --yes --registry https://registry.npmjs.org/ easy-vibe-kanban
```

也可以显式指定 package 和 bin：

```powershell
npx --yes --registry https://registry.npmjs.org/ --package easy-vibe-kanban easy-vibe-kanban
```

如果本机默认使用第三方镜像源，发布后可能需要等待镜像同步，或者测试时继续显式指定官方 registry。

## 失败排查

如果 npm publish 报认证错误，优先检查：

1. npm package settings 中 trusted publisher 的 owner、repo、workflow filename 是否完全匹配。
2. workflow 权限是否包含：

```yaml
permissions:
  contents: read
  id-token: write
```

3. workflow 是否使用 npm 11.5.1 或更高版本。
4. npm 后台是否要求 Environment name，但 GitHub job 没有配置对应 environment。

如果 npm publish 报版本已存在，换一个新的 `version` 重新执行 workflow。
