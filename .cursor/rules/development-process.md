# 開発プロセス（SDD + TDD）

## フロー

```
Explore → Plan → Do → Check → Action
 (調査)   (計画)  (実装)  (検証)  (完了)
```

1. **Explore**: 要件確認、コードベース調査
2. **Plan**: 実装計画作成、ユーザー確認
3. **Do**: テスト作成（RED）→ 実装（GREEN）→ リファクタ
4. **Check**: 全体テスト、コードレビュー
5. **Action**: PR作成、マージ

---

## Issue形式

### Feature（新機能）

```markdown
## User Story
**As a** <ユーザー種別>,
**I want** <実現したいこと>,
**So that** <得られる価値・理由>

## 受け入れ条件（AC）
### AC1: <条件名>
- **Given** <前提条件>
- **When** <操作・トリガー>
- **Then** <期待する結果>
```

### Bug（バグ修正）

```markdown
## 現象
<何が起きているか>

## 再現手順
1. ...
2. ...

## 期待する動作
<本来どう動くべきか>

## 受け入れ条件（修正確認）
- **Given** <再現手順の状態>
- **When** <操作>
- **Then** <正しい動作>
```

### Spike（調査）

```markdown
## 調査目的
<何を明らかにしたいか>

## 調査項目
- [ ] ...

## 成果物
- [ ] 調査結果のコメント
- [ ] 次のアクション Issue の作成
```

---

## ブランチ戦略

| ブランチ | 用途 |
|---------|------|
| `main` | 本番 |
| `develop` | 開発ベース |
| `feature/<番号>-<slug>` | 新機能 |
| `fix/<番号>-<slug>` | バグ修正 |

---

## テスト戦略

### Rust バックエンド

```bash
# 全テスト実行
cargo test --workspace

# 特定のテスト
cargo test test_name

# Lint
cargo clippy --workspace
```

### Frontend

```bash
# 型チェック
pnpm run check

# Lint
pnpm run lint
```

---

## 型定義の同期

Rust と TypeScript の型を同期するために ts-rs を使用:

```bash
# 型生成
pnpm run generate-types

# CI用（チェックのみ）
pnpm run generate-types:check
```

**注意**: `shared/types.ts` を直接編集しない。Rust 側の型定義を変更すること。

---

## コードスタイル

### Rust

- `rustfmt` で自動フォーマット
- `cargo clippy` で Lint チェック
- snake_case（モジュール）、PascalCase（型）

### TypeScript/React

- ESLint + Prettier
- 2スペース、シングルクォート
- PascalCase（コンポーネント）、camelCase（関数・変数）

---

## ラベル体系

| カテゴリ | ラベル例 |
|---------|---------|
| Type | `bug`, `feature`, `enhancement`, `spike` |
| Priority | `priority:high`, `priority:medium`, `priority:low` |
| Area | `area:backend`, `area:frontend`, `area:docs` |
