# Crew - AI-powered task management for everyone

## システム構成

| レイヤー | 技術 | ディレクトリ |
|---------|------|-------------|
| フロントエンド | React + TypeScript + Vite + Tailwind | `frontend/` |
| バックエンド | Rust (Axum) | `crates/` |
| DB | SQLite (SQLx) | ローカル |
| 共有型 | ts-rs自動生成 | `shared/types.ts` |

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

shared/           ← 共有型定義（自動生成・編集禁止）
docs/             ← ドキュメント
.cursor/          ← Agents/Rules/Skills
```

---

## 基本原則

1. **曖昧さの排除**: 不明点はユーザーにヒアリング
2. **最小変更**: 依頼範囲のみ。ついで修正禁止
3. **本番操作禁止**: デプロイ系コマンドは提示のみ

---

## Agent呼び出しルール

**トリガーに該当したら、該当Agentの定義ファイルを読んでその指示に従う。**

| 発言パターン | Agent | 定義ファイル |
|-------------|-------|-------------|
| 「#XX やって」「〜を実装して」「〜を作って」「〜を追加して」 | `explorer` → `planner` → `implementer` | 順に各定義ファイルを読む |
| 「#XX 調べて」「〜の影響範囲は？」「〜を確認して」 | `explorer` | `.cursor/agents/explorer.md` |
| 「どう実装する？」「計画立てて」「方針を決めて」 | `planner` | `.cursor/agents/planner.md` |
| 「コード書いて」「修正して」「直して」 | `implementer` | `.cursor/agents/implementer.md` |
| 「コードレビュー」「チェックして」 | `reviewer` | `.cursor/agents/reviewer.md` |
| 「〜をIssueに」「課題登録して」「タスク追加して」 | `task-organizer` | `.cursor/agents/task-organizer.md` |

### Agent定義ファイルの読み方

1. **トリガー発言を検知したら**、該当する定義ファイルを `Read` ツールで読む
2. **定義ファイルの指示に従って**タスクを実行する
3. **スキルが指定されている場合**、`.cursor/skills/<スキル名>/SKILL.md` も読む

例: 「実装して」と言われたら
```
1. Read .cursor/agents/implementer.md
2. implementer.md に skills: implement-tdd と書いてある
3. Read .cursor/skills/implement-tdd/SKILL.md
4. これらの指示に従ってTDD実装を行う
```

**重要**: Issueがなくても、機能追加・修正・改善の依頼は標準フロー（Explorer → Planner → Implementer）で対応する。

---

## 実装フロー（標準）

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. Explorer      要件調査・影響範囲分析                   │
│       ↓                                                     │
│  2. Planner       計画立案 → ユーザー承認                   │
│       ↓                                                     │
│  3. Implementer   TDD実装（RED→GREEN→Refactor）            │
│       ↓                                                     │
│  4. Reviewer      コードレビュー                           │
│       │                                                     │
│       ├─ NG → Implementerに戻る（テスト作り直し）          │
│       │                                                     │
│       └─ OK → ドキュメント作成・完了報告                   │
│                                                             │
│  ※ プッシュ・PR作成はユーザーが手動で実行                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 各Agentの責務

| Agent | 責務 | 出力 |
|-------|------|------|
| `explorer` | 要件把握、コード調査、影響範囲分析 | 調査レポート |
| `planner` | 実装計画立案、ユーザー承認取得 | 承認済み計画 |
| `implementer` | TDD実装（RED→GREEN→Refactor） | 実装済みコード |
| `reviewer` | 仕様面（AC）+コード面レビュー、NG時は差し戻し | レビュー結果 |
| `task-organizer` | 課題整理、要件分類、Issue作成 | Issue + 整理ドキュメント |

### 完了時の成果物

`docs/test-reports/YYYY-MM-DD/issue-XX-slug.md` に以下を記録:
- 計画内容（Plannerが立案したもの）
- テスト内容（Implementerが実施したもの）
- レビュー結果

---

## 開発コマンド

```bash
# インストール
pnpm i

# 起動（開発）
pnpm run dev

# QAモード起動（テスト推奨）
pnpm run dev:qa

# バックエンド（watch）
pnpm run backend:dev:watch

# フロントエンド（dev）
pnpm run frontend:dev

# 型チェック
pnpm run check          # Frontend
pnpm run backend:check  # Rust (cargo check)

# Lint
pnpm run lint           # Frontend
cargo clippy --workspace  # Rust

# テスト
cargo test --workspace  # Rust

# 型生成（Rust → TypeScript）
pnpm run generate-types

# SQLx準備
pnpm run prepare-db
```

---

## 型定義の同期

ts-rsを使用してRustの型からTypeScript型を自動生成:

```bash
pnpm run generate-types
```

**注意**: `shared/types.ts` を直接編集しない。`crates/server/src/bin/generate_types.rs` を編集すること。

---

## ドキュメント

| パス | 内容 |
|------|------|
| `docs/` | ドキュメント全般 |
| `docs/test-reports/` | テストレポート |
| `docs/records/issue-records/` | 課題整理の記録 |
| `.cursor/agents/` | Agent定義 |
| `.cursor/rules/` | 分野別ルール |
| `.cursor/skills/` | スキル定義 |

---

## ブランチ運用

新機能・改修は必ず新規ブランチで実施:
- `feature/<番号>-<slug>` - 新機能
- `fix/<番号>-<slug>` - バグ修正

---

## コーディングスタイル

### Rust
- `rustfmt` で自動フォーマット
- `cargo clippy` で Lint チェック
- snake_case（モジュール）、PascalCase（型）
- `unwrap()` 乱用禁止、適切な `Result`/`Option` 処理

### TypeScript/React
- ESLint + Prettier (2スペース、シングルクォート)
- PascalCase（コンポーネント）、camelCase（関数・変数）
- `any` 型の使用禁止

---

## テストガイドライン

### Rust
- 単体テストはコードと同じファイル (`#[cfg(test)]`)
- 統合テストは `tests/` ディレクトリ
- `cargo test --workspace` で全テスト実行

### Frontend
- `pnpm run check` と `pnpm run lint` を通過すること
- E2Eテストは MCP browser-test を使用

---

## セキュリティ

- `.env` はコミット禁止
- 秘匿情報は環境変数で管理
- SQLxのパラメータバインディング使用
- ユーザー入力は検証・サニタイズ
