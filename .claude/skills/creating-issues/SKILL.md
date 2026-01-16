---
name: creating-issues
description: GitHub Issueを作成する。「Issue作って」「タスク追加」「チケット作成」「課題登録」「これをIssueに」などで使用。新しいタスクや課題を登録する時に必ず使用する。
---

# GitHub Issue作成

<context>
このスキルはSDD（仕様駆動開発）形式でGitHub Issueを作成する。
User StoryとAC（受け入れ条件）を明確に記述し、
そのままテストコードに変換できる粒度で書く。
</context>

## いつ使うか

- 「Issue作って」「タスク追加して」「チケット登録して」と言われた時
- 新機能の要望を受けた時
- バグ報告を受けた時
- 調査タスクが必要な時
- 「これをIssueにして」と言われた時

## いつ使わないか

- 既存Issueの実装 → `/explore-issue`
- Issueの確認 → `gh issue view`
- PRの作成 → `/create-pr`

---

## フロー

```
1. Issue作成（gh issue create）
2. ユーザーに報告
```

---

## Issueタイプ

<decision_table>
| タイプ | 用途 | テンプレート |
|--------|------|-------------|
| Feature | 新機能・機能追加 | User Story + AC |
| Enhancement | 既存機能の改善 | 目的 + AC |
| Bug | バグ報告・不具合 | 現象 + 原因 + AC |
| Spike | 調査・検証・設計 | 目的 + 調査項目 |
</decision_table>

---

## Feature Issue

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

### AC2: <条件名>
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

---

## Enhancement Issue

```bash
gh issue create --title "<タイトル>" --body "$(cat <<'EOF'
## 目的
<何を改善したいか>

## 現状の問題
<現在の状況と課題>

## 提案する改善
<どのように改善するか>

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

---

## Bug Issue

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

## 原因の可能性
<考えられる原因>

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

## Spike Issue

```bash
gh issue create --title "[Spike] <調査内容>" --body "$(cat <<'EOF'
## 調査目的
<何を明らかにしたいか>

## 背景
<なぜ調査が必要か>

## 調査項目
- [ ]
- [ ]

## 成果物
- [ ] 調査結果のコメント
- [ ] 次のアクション Issue の作成

---
Created with Claude Code
EOF
)"
```

---

## ACの書き方

<example type="good">
<description>具体的で、テストに変換可能</description>
```markdown
### AC1: ログイン成功
- **Given** 登録済みユーザーが存在する
- **When** 正しいメールアドレスとパスワードでログイン
- **Then** ダッシュボードにリダイレクトされる

### AC2: ログイン失敗
- **Given** 登録済みユーザーが存在する
- **When** 間違ったパスワードでログイン
- **Then** エラーメッセージ「パスワードが正しくありません」が表示される
```
</example>

<example type="bad">
<description>曖昧で、テストに変換できない</description>
```markdown
### AC1
- ユーザーがログインできる

### AC2
- エラー時にメッセージが出る
```
</example>

---

## 出力形式

<output_format>
```markdown
## Issue作成完了

- **Issue**: #XX <タイトル>
- **URL**: https://github.com/xxx/yyy/issues/XX
- **タイプ**: Feature / Enhancement / Bug / Spike
```
</output_format>

---

## エラー時の対応

<error_handling>
| 状況 | 対応 |
|------|------|
| Issue作成失敗 | `gh auth status`で認証確認 |
| ACが書けない | ユーザーに具体的な期待動作を確認 |
| 重複Issueの可能性 | `gh issue list`で既存Issue確認 |
</error_handling>

---

## 重要

<important>
- **ACはテストコードに変換できる粒度で書く**
- Given/When/Then形式を必ず使う
- 曖昧な表現は避ける
</important>
