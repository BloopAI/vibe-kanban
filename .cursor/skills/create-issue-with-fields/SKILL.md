---
name: create-issue-with-fields
description: GitHub Issueを作成し、ラベルやマイルストーンを設定する。task-organizerエージェントで使用。ユーザー承認後に呼ばれる。
---

# Issue作成（フィールド設定付き）

<context>
ユーザーが課題分析の提案を承認した後に呼ばれる。
GitHub Issueを作成し、ラベルやマイルストーンを設定する。
</context>

## いつ使うか

- `/analyze-task` の提案がユーザーに承認された後
- 「OK」「作って」「登録して」と言われた時

## いつ使わないか

- まだ分析・提案していない → `/analyze-task`
- ユーザーが承認していない

---

## フロー

<steps>
1. Issue作成（gh issue create）
2. ラベル設定（gh issue edit --add-label）
3. 完了報告
</steps>

---

## Issue作成テンプレート

### Feature（新機能）

```bash
gh issue create --title "<タイトル>" --body "$(cat <<'EOF'
## User Story
**As a** <ユーザー種別>,
**I want** <実現したいこと>,
**So that** <得られる価値・理由>

## 背景・目的
<なぜこの機能が必要か>

## 受け入れ条件（Acceptance Criteria）

### AC1: <条件名>
- **Given** <前提条件>
- **When** <操作・トリガー>
- **Then** <期待する結果>

## 完了の定義（Definition of Done）
- [ ] 受け入れ条件のテストが全て通る
- [ ] コードレビュー済み

---
Created with Claude Code
EOF
)"
```

### Bug（バグ修正）

```bash
gh issue create --title "[Bug] <タイトル>" --body "$(cat <<'EOF'
## 現象
<何が起きているか>

## 再現手順
1.
2.
3.

## 期待する動作
<本来どう動くべきか>

## 受け入れ条件（修正確認）
- **Given** <再現手順の状態>
- **When** <操作>
- **Then** <正しい動作>

---
Created with Claude Code
EOF
)"
```

---

## 実行コマンド

### 1. Issue作成

```bash
gh issue create --title "<タイトル>" --body "<本文>"
```

→ Issue番号を取得

### 2. ラベル設定

```bash
# ラベル追加
gh issue edit <番号> --add-label "bug"
gh issue edit <番号> --add-label "enhancement"
gh issue edit <番号> --add-label "priority:high"
```

---

## 出力形式

<output_format>
```markdown
## Issue作成完了

| 項目 | 値 |
|------|-----|
| Issue | #<番号> <タイトル> |
| URL | https://github.com/xxx/yyy/issues/<番号> |
| Type | Bug / Feature / Enhancement |
| Priority | High / Medium / Low |
| Labels | <設定したラベル> |
```
</output_format>

---

## 例

<example type="good">
<description>全フィールド設定、URL付き報告</description>
```markdown
## Issue作成完了

| 項目 | 値 |
|------|-----|
| Issue | #118 タスク一覧のページネーション実装 |
| URL | https://github.com/ogasawarariku/vibe-kanban-neo/issues/118 |
| Type | Enhancement |
| Priority | Medium |
| Labels | enhancement, performance |
```
</example>

---

## エラー時の対応

<error_handling>
| 状況 | 対応 |
|------|------|
| Issue作成失敗 | エラーメッセージを確認、リポジトリ権限を確認 |
| ラベル設定失敗 | ラベルが存在するか確認 |
</error_handling>

---

## 重要

<important>
- **ユーザー承認後のみ実行**: 勝手に作成しない
- **URLを報告**: ユーザーが確認できるように
</important>
