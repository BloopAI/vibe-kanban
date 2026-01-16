---
name: backend-test
description: バックエンドのユニット/APIテスト。TDDを実行。implementerエージェントで使用。Rust (cargo test) を使用。
---

# Backend Test (Rust)

<context>
このスキルはバックエンドのテスト駆動開発に使用。
plannerの計画でAPI/サービス層の変更が含まれる場合に選択される。
</context>

## いつ使うか

- Rust APIエンドポイントの追加・変更
- サービス層のロジック変更
- SQLxモデルの変更
- CRUD操作の追加・変更

## いつ使わないか

- フロントエンドのみの変更 → `/browser-test`
- 設定ファイルのみの変更 → テスト不要の場合あり

---

## テスト配置

```
crates/
├── server/
│   └── tests/           # 統合テスト
│       └── test_api.rs
├── services/
│   └── src/
│       └── xxx.rs       # 単体テスト (#[cfg(test)])
└── db/
    └── src/
        └── xxx.rs       # 単体テスト (#[cfg(test)])
```

---

## TDDフロー

<steps>
1. テストファイル作成（RED）
2. テスト実行 → 失敗確認
3. 実装（GREEN）
4. テスト実行 → 成功確認
5. リファクタリング
6. テスト実行 → 成功維持確認
</steps>

---

## テストコマンド

```bash
# 全テスト
cargo test --workspace

# 特定クレート
cargo test -p server

# 特定のテスト
cargo test test_name

# 詳細出力
cargo test --workspace -- --nocapture

# Lint
cargo clippy --workspace
```

---

## 例

<example type="good">
<description>ACに1:1対応、Given/When/Then形式、docstring明確</description>
```rust
// crates/server/tests/test_tasks.rs

use axum::http::StatusCode;
use sqlx::PgPool;

/// Issue #85: タスク一覧ページネーション
mod test_tasks_pagination {
    use super::*;

    #[tokio::test]
    async fn test_ac1_pagination_with_limit() {
        // AC1: limit指定で件数を制限できる
        // Given: 20件のタスクが存在する
        let pool = setup_test_db().await;
        for i in 0..20 {
            create_task(&pool, &format!("Task{}", i)).await;
        }

        // When: limit=10でGET /tasks
        let app = create_test_app(&pool);
        let response = app
            .oneshot(Request::get("/api/tasks?limit=10").body(Body::empty()).unwrap())
            .await
            .unwrap();

        // Then: 10件のタスクとtotal=20が返る
        assert_eq!(response.status(), StatusCode::OK);
        let body: TaskListResponse = parse_body(response).await;
        assert_eq!(body.items.len(), 10);
        assert_eq!(body.total, 20);
    }

    #[tokio::test]
    async fn test_ac2_pagination_with_offset() {
        // AC2: offset指定でスキップできる
        // Given: 20件のタスクが存在する
        let pool = setup_test_db().await;
        for i in 0..20 {
            create_task(&pool, &format!("Task{:02}", i)).await;
        }

        // When: offset=10,limit=5でGET /tasks
        let app = create_test_app(&pool);
        let response = app
            .oneshot(Request::get("/api/tasks?offset=10&limit=5").body(Body::empty()).unwrap())
            .await
            .unwrap();

        // Then: 11-15件目の5件が返る
        assert_eq!(response.status(), StatusCode::OK);
        let body: TaskListResponse = parse_body(response).await;
        assert_eq!(body.items.len(), 5);
    }
}
```
</example>

<example type="bad">
<description>ACと無関係、Given/When/Thenなし、何をテストしているか不明</description>
```rust
#[test]
fn test_tasks() {
    let result = get_tasks();
    assert!(result.is_ok());
}

#[test]
fn test_tasks2() {
    let result = create_task("test");
    assert!(result.is_some());
}
```
</example>

---

## テストパターン

### 一覧取得

```rust
#[tokio::test]
async fn test_get_list() {
    let pool = setup_test_db().await;
    let app = create_test_app(&pool);
    
    let response = app
        .oneshot(Request::get("/api/items").body(Body::empty()).unwrap())
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
}
```

### 詳細取得

```rust
#[tokio::test]
async fn test_get_detail() {
    // Given
    let pool = setup_test_db().await;
    let item = create_item(&pool, "test").await;

    // When
    let app = create_test_app(&pool);
    let response = app
        .oneshot(Request::get(&format!("/api/items/{}", item.id)).body(Body::empty()).unwrap())
        .await
        .unwrap();

    // Then
    assert_eq!(response.status(), StatusCode::OK);
    let body: Item = parse_body(response).await;
    assert_eq!(body.name, "test");
}
```

### エラーケース

```rust
#[tokio::test]
async fn test_not_found() {
    let pool = setup_test_db().await;
    let app = create_test_app(&pool);
    
    let response = app
        .oneshot(Request::get("/api/items/9999").body(Body::empty()).unwrap())
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
```

---

## エラー時の対応

<error_handling>
| 状況 | 対応 |
|------|------|
| コンパイルエラー | エラーメッセージを確認、型を修正 |
| DBエラー | DB接続を確認、マイグレーション確認 |
| テスト失敗 | 実装を修正、デバッグ |
| SQLxエラー | `pnpm run prepare-db` を実行 |
</error_handling>

---

## ACとの対応

<important>
テストはIssueのACに**1:1で対応**させる:

| AC | テストメソッド名 |
|----|-----------------|
| AC1: 一覧取得できる | `test_ac1_get_list` |
| AC2: 詳細取得できる | `test_ac2_get_detail` |
| AC3: 新規作成できる | `test_ac3_create` |
</important>
