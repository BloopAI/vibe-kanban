---
name: explore-issue
description: 問題・要件を調査し、実装に必要な情報を収集する。explorerエージェントで使用。調査後はplannerに引き継ぐ。
---

# 調査スキル

<context>
このスキルは実装フローの最初のステップ。
要件/問題の内容を把握し、関連コードを特定し、影響範囲を分析する。
Issueがなくても、機能追加・修正・改善の依頼に対して使用する。
</context>

## いつ使うか

- 「#XX 調べて」「#XX の影響範囲は？」と言われた時
- 「〜を実装して」「〜を作って」「〜を追加して」と言われた時（Issueがなくても）
- 「〜を確認して」「〜がどうなってる？」と聞かれた時
- 機能追加・修正・改善の依頼を受けた時（最初のステップ）
- コードベースの調査が必要な時

## いつ使わないか

- 既に調査済みで計画フェーズに入る時 → `/plan-implementation`
- 実装フェーズ → `/implement-tdd`

---

## フロー

<steps>
1. Issue内容を取得（Issueがある場合）
2. 関連ドキュメントを確認（docs/）
3. 関連コードを特定
   - Rust: `crates/` 配下
   - Frontend: `frontend/src/` 配下
4. 影響範囲を分析
5. 調査結果を報告
6. plannerに引き継ぎ
</steps>

---

## プロジェクト構造

```
crates/           ← Rust バックエンド
├── server/       ← API + バイナリ
├── db/           ← SQLx モデル/マイグレーション
├── executors/    ← タスク実行
├── services/     ← ビジネスロジック
└── utils/        ← ユーティリティ

frontend/         ← React + TypeScript
└── src/
    ├── components/
    ├── pages/
    └── hooks/

shared/           ← 共有型定義（自動生成）
```

---

## コマンド

```bash
# Issue内容取得
gh issue view <番号>

# Issue一覧（関連Issue確認）
gh issue list --label "xxx"

# Rustコード検索
rg "キーワード" crates/

# Frontendコード検索
rg "キーワード" frontend/src/
```

---

## 出力形式

<output_format>
```markdown
## 調査結果: <Issue #XX / タスク名>

### 概要
- **タイトル**: ...
- **目的**: ...（User Storyまたは依頼内容）
- **受け入れ条件（AC）**:
  - AC1: Given... When... Then...
  - AC2: Given... When... Then...
  ※ Issueがない場合は依頼内容から推測して設定

### 関連ファイル
| ファイル | 役割 | 変更の可能性 |
|---------|------|-------------|
| `crates/server/src/api/xxx.rs` | ... | 高 |
| `frontend/src/components/xxx.tsx` | ... | 中 |

### 影響範囲
- 直接影響: ...
- 間接影響: ...

### 懸念点・確認事項
- [ ] ...

### 次のステップ
→ plannerに引き継ぎ、実装計画を立案
```
</output_format>

---

## 例

<example type="good">
<description>ACを明確に抽出し、関連ファイルを具体的に特定</description>
```markdown
## 調査結果: Issue #85

### 概要
- **タイトル**: タスク一覧にページネーション追加
- **User Story**: As a ユーザー, I want ページネーション付きでタスク一覧を取得したい, So that 大量データでもパフォーマンスが維持できる
- **受け入れ条件（AC）**:
  - AC1: Given 100件のタスクが存在する When limit=10で取得 Then 10件とtotal=100が返る
  - AC2: Given 100件のタスクが存在する When offset=50,limit=10で取得 Then 51-60件目が返る

### 関連ファイル
| ファイル | 役割 | 変更の可能性 |
|---------|------|-------------|
| `crates/server/src/api/tasks.rs` | タスクAPI | 高（パラメータ追加） |
| `crates/services/src/tasks.rs` | ビジネスロジック | 高（ページネーション実装） |
| `frontend/src/pages/ProjectTasks.tsx` | タスク一覧画面 | 高（UI変更） |

### 影響範囲
- 直接影響: タスク一覧API
- 間接影響: フロントエンドのタスク管理画面

→ plannerに引き継ぎ
```
</example>

<example type="bad">
<description>ACが曖昧、関連ファイルが不明確</description>
```markdown
## 調査結果: Issue #85

### 概要
- ページネーションを追加する

### 関連ファイル
- tasks.rs

### 次のステップ
- 実装する
```
</example>

---

## エラー時の対応

<error_handling>
| 状況 | 対応 |
|------|------|
| Issueが見つからない | `gh issue list`で番号を確認 |
| ACが不明確 | `AskUserQuestion`でユーザーに確認 |
| 関連コードが特定できない | Grep/Globで広範囲検索 |
| ドキュメントがない | 該当なしと報告 |
</error_handling>

---

## 次のステップ

<next_agent>
調査完了後 → **planner** に引き継ぎ、実装計画を立案
</next_agent>
