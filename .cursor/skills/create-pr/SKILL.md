---
name: create-pr
description: PRを作成する。「PR作って」「プルリク出して」で使用。**ユーザーが明示的に依頼した時のみ**使用。自動では呼び出さない。
---

# PR作成

<context>
このスキルはユーザーが明示的に「PR作って」と依頼した時のみ使用。
reviewerから自動で呼び出さない。
プッシュとPR作成はユーザーの意思決定が必要。
</context>

## いつ使うか

- 「PR作って」「プルリク出して」「PRお願い」と**明示的に依頼された時**
- ユーザーがレビュー済みで、マージ準備ができている時

## いつ使わないか

- 実装完了後に自動で → ユーザーに確認を求める
- レビューがまだの時 → `/code-review`
- 実装中 → `/implement-tdd`

---

## 前提条件

<important>
1. 実装が完了していること
2. レビューが完了していること（OKであること）
3. **ユーザーが明示的に「PR作って」と依頼していること**
</important>

---

## フロー

<steps>
1. 現在のブランチ・コミット状況を確認
2. リモートにプッシュ
3. PR作成
4. PR URLを報告
</steps>

---

## コマンド

### 1. 状況確認

```bash
git status
git log --oneline -3
```

### 2. プッシュ

```bash
git push -u origin <ブランチ名>
```

### 3. PR作成

```bash
gh pr create --base main --title "<タイトル>" --body "$(cat <<'EOF'
## Summary
- <変更内容>

## Related Issue
Fixes #<番号>（またはIssueがない場合は省略）

## Test Plan
- [ ] 全テスト通過 (`cargo test --workspace`)
- [ ] 型チェック通過 (`pnpm run check`)
- [ ] AC確認済み
- [ ] レビュー済み

## Changes
- <変更点1>
- <変更点2>

---
Generated with Claude Code
EOF
)"
```

---

## 出力形式

<output_format>
```markdown
## PR作成完了

- **PR**: #XX <タイトル>
- **URL**: https://github.com/xxx/yyy/pull/XX
- **ブランチ**: `feature/xxx` → `main`
```
</output_format>

---

## 例

<example type="good">
<description>明示的な依頼を受けてPR作成、URL報告</description>
```markdown
## PR作成完了

- **PR**: #42 タスク一覧にページネーション追加
- **URL**: https://github.com/ogasawarariku/vibe-kanban-neo/pull/42
- **ブランチ**: `feature/85-pagination` → `main`
```
</example>

<example type="bad">
<description>ユーザーの明示的依頼なしに自動でPR作成</description>
```markdown
実装が完了したのでPRを作成しました。

→ これはNG。ユーザーに確認を求めるべき。
```
</example>

---

## エラー時の対応

<error_handling>
| 状況 | 対応 |
|------|------|
| プッシュ失敗 | `git status`で状態確認、upstream設定確認 |
| PR作成失敗 | `gh auth status`で認証確認 |
| ベースブランチ間違い | `--base main`を確認 |
| コンフリクト | mainをマージしてから再度プッシュ |
</error_handling>

---

## 重要

<important>
- **ユーザーの明示的依頼がない限りPRを作成しない**
- 実装完了後は「PR作成しますか？」と確認を求める
- ベースブランチを確認（通常はmain）
- PR作成後はURLを報告
</important>
