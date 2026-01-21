# Fork 仓库工作流程指南

## 📋 仓库信息

| 项目 | 值 |
|------|-----|
| 你的 Fork | `jiangnan823/vibe-kanban` |
| 原始仓库 | `BloopAI/vibe-kanban` |
| 本地路径 | `~/Documents/trae_projects/vibe-kanban` |

---

## 🔧 初始配置（一次性）

### 1. 配置 upstream（原始仓库）

```bash
cd ~/Documents/trae_projects/vibe-kanban

# 添加原始仓库
git remote add upstream https://github.com/BloopAI/vibe-kanban.git

# 验证配置
git remote -v
```

应该看到：
```
origin    git@github.com:jiangnan823/vibe-kanban.git (fetch)
origin    git@github.com:jiangnan823/vibe-kanban.git (push)
upstream  https://github.com/BloopAI/vibe-kanban.git (fetch)
upstream  https://github.com/BloopAI/vibe-kanban.git (push)
```

### 2. 创建同步脚本（已完成）✅

同步脚本已创建：`sync-fork.sh`

```bash
chmod +x sync-fork.sh
```

---

## 🚀 日常工作流程

### 场景 1: 你要添加新功能

```bash
# 1. 切换到主分支并同步最新代码
git checkout main
./sync-fork.sh

# 2. 创建功能分支
git checkout -b feature-你的功能名

# 3. 开发并提交
git add .
git commit -m "添加: 描述你的改动"

# 4. 推送到你的 fork
git push origin feature-你的功能名

# 5. 开发完成后，合并回主分支
git checkout main
git merge feature-你的功能名

# 6. 推送主分支
git push origin main

# 7. 删除功能分支（可选）
git branch -d feature-你的功能名
```

### 场景 2: 原仓库更新了，你想同步

```bash
# 方法 1: 使用同步脚本
./sync-fork.sh

# 方法 2: 手动同步
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

### 场景 3: 同步时遇到冲突

```bash
# 1. 同步时出现冲突
git fetch upstream
git checkout main
git merge upstream/main
# Auto-merging file.txt
# CONFLICT (content): Merge conflict in file.txt

# 2. 查看冲突文件
git status

# 3. 手动编辑文件，解决冲突
# 打开冲突文件，查找并删除冲突标记：
# <<<<<<< HEAD
# 你的代码
# =======
# 原仓库代码
# >>>>>>> upstream/main

# 4. 标记冲突已解决
git add file.txt

# 5. 完成合并
git commit

# 6. 推送
git push origin main
```

---

## 📂 推荐的分支策略

```
main (主分支)
  ├── 保持与 upstream 同步
  ├── 只接受已完成的合并
  └── 始终可运行

feature/* (功能分支)
  ├── 从 main 创建
  ├── 开发新功能
  └── 完成后合并回 main

bugfix/* (修复分支)
  ├── 从 main 创建
  ├── 修复 bug
  └── 完成后合并回 main
```

---

## ⚠️ 注意事项

1. **永远不要在 main 分支直接开发**
   - 创建功能分支进行开发
   - 测试通过后再合并到 main

2. **定期同步 upstream**
   - 每次开始新功能前先同步
   - 每周至少同步一次

3. **提交前先拉取**
   ```bash
   git pull origin main
   git push origin main
   ```

4. **保持提交历史清晰**
   ```bash
   # 查看提交历史
   git log --oneline --graph --all
   ```

---

## 🔄 完整示例：添加一个新功能

```bash
# 进入项目目录
cd ~/Documents/trae_projects/vibe-kanban

# 同步最新代码
./sync-fork.sh

# 创建功能分支
git checkout -b feature-add-user-auth

# 开发中...
# 编辑文件...
git add .
git commit -m "feat: 添加用户认证功能"

# 再次同步（防止 main 有新更新）
git checkout main
./sync-fork.sh

# 合并功能分支
git merge feature-add-user-auth

# 如有冲突，解决后：
# git add <冲突文件>
# git commit

# 推送
git push origin main

# 清理
git branch -d feature-add-user-auth
```

---

## 🆘 常见问题

| 问题 | 解决方案 |
|------|----------|
| `upstream not found` | 运行 `git remote add upstream <原始仓库地址>` |
| 推送失败 | 先运行 `git pull --rebase origin main` |
| 搞乱了怎么办 | `git reset --hard upstream/main`（会丢失本地修改） |
| 查看远程仓库 | `git remote -v` |
| 查看 origin 和 upstream 差异 | `git log HEAD..upstream/main` |

---

## 📝 配置清单

- [x] 填写原始仓库地址 ✅
- [x] 配置 upstream 远程仓库 ✅
- [x] 给同步脚本添加执行权限 ✅
- [x] 测试一次同步流程 ✅

**状态**: 所有配置已完成！可以开始使用工作流程了。
