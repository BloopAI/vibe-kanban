---
name: implement-tdd
description: TDDフローでコードを実装し、検証完了後にreviewerに自動引き継ぎ。implementerエージェントで使用。RED→GREEN→Refactor→検証まで担当。
---

# TDD実装（検証後に自動引き継ぎ）

<context>
このスキルはplannerの承認済み計画に従ってTDDで実装し、**検証完了後にreviewerに自動引き継ぎ**する。
レビュー・レポート作成はreviewerの責務。
</context>

## いつ使うか

- plannerの計画が承認された後
- 「実装して」「コード書いて」と言われた時
- テスト駆動で開発する時

## いつ使わないか

- まだ計画が承認されていない → `/plan-implementation`
- 調査フェーズ → `/explore-issue`

---

## フロー

<steps>
1. ブランチ作成
2. テスト種別を判断（バックエンド/フロントエンド）
3. **RED**: 失敗するテストを書く → 実行 → 失敗確認
4. **GREEN**: テストが通る最小限の実装 → 実行 → 成功確認
5. **Refactor**: コード改善 → 実行 → 成功維持確認
6. **型生成**: `pnpm run generate-types`（Rust型変更時）
7. **検証**: 全テスト実行 → ACチェック
8. **引き継ぎ**: reviewerに自動委譲
</steps>

<important>
**検証完了後、reviewerを呼び出す。**
reviewerがNG判定を出したら、修正してREDから再実行。
</important>

---

## テスト種別の判断

<decision_table>
| 変更対象 | 使用スキル | テスト方法 |
|---------|-----------|-----------|
| バックエンド（Rust API/サービス） | `/backend-test` | `cargo test --workspace` |
| フロントエンド（React UI） | `/browser-test` | E2Eテスト |
| 両方 | 両方使用 | cargo test + E2E |
</decision_table>

---

## TDDサイクル

```
┌─────────────────────────────────────────┐
│                                         │
│   RED ──────→ GREEN ──────→ Refactor   │
│    │           │              │        │
│    │           │              │        │
│  テスト作成   実装         コード改善   │
│  （失敗）    （成功）                   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 品質ガードレール

<important>
**禁止パターン:**
- テストの期待値をそのまま返すハードコード実装
- `return None` や `return []` などのスタブ実装
- テストケースの値だけに対応した決め打ちコード
- `unwrap()`の乱用（Rust）
- `any`型の使用（TypeScript）

**原則**: 「テストケース以外の入力でも動作するか？」をセルフチェック
</important>

---

## 例（Rust）

<example type="good">
<description>ACに対応したテスト、Given/When/Then形式</description>
```rust
// crates/server/tests/test_tasks.rs

#[tokio::test]
async fn test_ac1_pagination_with_limit() {
    // AC1: limit指定で件数を制限できる
    // Given: 20件のタスクが存在する
    let pool = setup_test_db().await;
    for i in 0..20 {
        create_task(&pool, &format!("Task{}", i)).await;
    }

    // When: limit=10でGET /tasks
    let response = client.get("/api/tasks?limit=10").send().await;

    // Then: 10件のタスクとtotal=20が返る
    assert_eq!(response.status(), 200);
    let body: TaskListResponse = response.json().await;
    assert_eq!(body.items.len(), 10);
    assert_eq!(body.total, 20);
}
```
</example>

<example type="bad">
<description>ACと無関係、曖昧なテスト</description>
```rust
#[test]
fn test_tasks() {
    // 何をテストしているか不明
    // Given/When/Thenがない
    let result = get_tasks();
    assert!(result.is_ok());
}
```
</example>

---

## ブランチ作成

```bash
git checkout main
git pull origin main
git checkout -b feature/<番号>-<slug>
```

---

## テストコマンド

```bash
# Rust全テスト
cargo test --workspace

# 特定のテスト
cargo test test_name

# フロントエンド型チェック
pnpm run check

# Lint
cargo clippy --workspace
pnpm run lint

# 型生成（Rust → TypeScript）
pnpm run generate-types
```

---

## 出力形式

<output_format>
```markdown
## 実装結果: <タスク名/Issue #XX>

### テスト結果
| テスト | AC | 結果 |
|--------|-----|------|
| `test_ac1_xxx` | AC1 | PASS |
| `test_ac2_xxx` | AC2 | PASS |

### 変更ファイル
| ファイル | 変更内容 |
|---------|---------|
| `crates/server/src/api/xxx.rs` | 新規作成 |
| `frontend/src/components/xxx.tsx` | 修正 |

### テスト結果
All tests passed

---

→ reviewerに引き継ぎ
```
</output_format>

---

## エラー時の対応

<error_handling>
| 状況 | 対応 |
|------|------|
| テストが書けない | ACを確認、不明なら`AskUserQuestion` |
| テストが通らない | 実装を見直し、デバッグ |
| 実装が複雑すぎる | 計画を見直し、plannerに相談 |
| 依存関係エラー | 環境を確認、再起動 |
</error_handling>

---

## 制約

<constraints>
- plannerの計画に従って実装する
- 依頼された範囲のみ実装
- 過剰な改善・ついで修正は禁止
- テストが通ることを必ず確認
- **コミットはしない**（ユーザーが手動）
</constraints>

---

## 次のステップ

<next_agent>
検証完了後 → **reviewer** を自動呼び出し
</next_agent>
