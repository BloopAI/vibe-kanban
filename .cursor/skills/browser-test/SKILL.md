---
name: browser-test
description: フロントエンドのE2Eテスト。ブラウザ自動化でUIをテスト。implementerエージェントで使用。
---

# Browser Test (E2E)

<context>
このスキルはフロントエンドのE2Eテストに使用。
plannerの計画でUI変更が含まれる場合に選択される。
Playwright, Cypress, agent-browser等のツールを使用。
</context>

## いつ使うか

- UIコンポーネントの追加・変更
- ユーザーインタラクションのテスト
- フォーム操作のテスト
- ナビゲーションのテスト

## いつ使わないか

- バックエンドのみの変更 → `/backend-test`
- 単体テストで十分な場合

---

## E2Eテストフロー

<steps>
1. 開発サーバー起動（`pnpm run dev:qa`）
2. ブラウザでページを開く
3. ページの状態を確認
4. ユーザー操作を実行（クリック、入力等）
5. 結果を確認
6. ブラウザを閉じる
</steps>

---

## 基本コマンド例（MCP browser-test）

```bash
# ページを開く
# CallMcpTool: cursor-ide-browser / browser_navigate
# url: http://localhost:5173/page

# スナップショット取得
# CallMcpTool: cursor-ide-browser / browser_snapshot

# 要素をクリック
# CallMcpTool: cursor-ide-browser / browser_click
# element: "ボタンテキスト" または ref番号

# テキストを入力
# CallMcpTool: cursor-ide-browser / browser_type
# text: "入力テキスト"

# ページ内容を確認
# CallMcpTool: cursor-ide-browser / browser_snapshot
```

---

## 例

<example type="good">
<description>段階的な操作、各ステップでの確認</description>
```markdown
## E2Eテスト: タスク作成フロー

### 1. プロジェクト画面を開く
- browser_navigate: http://localhost:5173/project/1
- browser_snapshot で画面確認

### 2. 新規タスクボタンをクリック
- browser_click: "新規タスク" ボタン
- browser_snapshot でダイアログ確認

### 3. タスク情報を入力
- browser_type: "テストタスク" (タイトル欄)
- browser_type: "説明文" (説明欄)
- browser_snapshot で入力確認

### 4. 保存ボタンをクリック
- browser_click: "保存" ボタン
- browser_snapshot で結果確認

### 5. タスク一覧に表示されることを確認
- "テストタスク" が一覧に表示されている

### 結論
E2Eテスト: PASS
```
</example>

<example type="bad">
<description>確認なしで操作、エラーハンドリングなし</description>
```markdown
タスク作成をテスト
- ボタンクリック
- 入力
- 保存
# 結果確認なし
```
</example>

---

## テストシナリオ

### フォーム送信

```markdown
1. フォーム入力
   - browser_type: "test@example.com" (email欄)
   - browser_type: "テスト太郎" (name欄)
2. 送信ボタンクリック
   - browser_click: "送信"
3. 成功メッセージを確認
   - browser_snapshot で "登録が完了しました" を確認
```

### バリデーションエラー

```markdown
1. 空のフォームを送信
   - browser_click: "送信"
2. エラーメッセージを確認
   - browser_snapshot で "必須項目です" を確認
```

### ナビゲーション

```markdown
1. メニューをクリック
   - browser_click: "設定"
2. ページ遷移を確認
   - browser_snapshot で設定画面を確認
```

---

## 出力形式

<output_format>
```markdown
## E2Eテスト結果

### シナリオ: タスク作成フロー

| ステップ | 操作 | 結果 |
|----------|------|------|
| 1 | プロジェクト画面を開く | OK |
| 2 | 新規タスクボタンをクリック | OK |
| 3 | タスク情報を入力 | OK |
| 4 | 保存ボタンをクリック | OK |
| 5 | タスク一覧に表示確認 | OK |

### 結論
E2Eテスト: PASS
```
</output_format>

---

## エラー時の対応

<error_handling>
| 状況 | 対応 |
|------|------|
| 要素が見つからない | browser_snapshotで要素を確認 |
| タイムアウト | 待機時間を増やす、ページロード確認 |
| ネットワークエラー | 開発サーバーの起動状態を確認 |
| 予期しない画面 | スクリーンショットを取得して確認 |
</error_handling>

---

## 重要

<important>
- 各操作後にスナップショットで状態を確認
- 非同期処理は明示的に待機
- テスト終了時は開発サーバーの状態を確認
- エラー時はスクリーンショットを保存
</important>

---

## 開発サーバー

```bash
# QAモードで起動（推奨）
pnpm run dev:qa

# 通常の開発モード
pnpm run dev
```
