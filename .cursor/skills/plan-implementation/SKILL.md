---
name: plan-implementation
description: 実装計画を作成しユーザー承認を得る。plannerエージェントで使用。explorerの後、implementerの前に呼ばれる。
---

# 実装計画作成

<context>
このスキルはexplorerの調査結果を元に実装計画を立案する。
**ユーザー承認が必須**。承認なしに実装を開始してはならない。
</context>

## いつ使うか

- explorerの調査が完了した後
- 「計画立てて」「どう実装する？」と言われた時
- 実装方針の確認が必要な時

## いつ使わないか

- まだ調査が完了していない → `/explore-issue`
- 既に計画が承認されている → `/implement-tdd`

---

## フロー

<steps>
1. explorerの調査結果を確認
2. 変更ファイルを特定
3. 実装ステップを設計
4. リスク・確認事項を洗い出し
5. **ユーザーに承認を求める**（必須）
6. 承認後、implementerに引き継ぎ
</steps>

---

## 技術スタック別の考慮事項

### Rust バックエンド

- SQLxのマイグレーションが必要か確認
- ts-rsで型定義の再生成が必要か（`pnpm run generate-types`）
- 既存のエラーハンドリングパターンに従う
- `Result`/`Option`の適切な使用

### React フロントエンド

- 既存コンポーネントの再利用を優先
- Tailwind CSSのクラス命名規則に従う
- 型安全性を維持（shared/types.ts）
- ESLint/Prettierのルールに従う

---

## 出力形式

<output_format>
```markdown
## 実装計画: <タスク名/Issue #XX>

### 概要
<1-2文で何を実装するか>

### 変更ファイル
| ファイル | 変更内容 | 種別 |
|---------|---------|------|
| `crates/server/src/api/xxx.rs` | API追加 | 新規 |
| `frontend/src/components/xxx.tsx` | コンポーネント修正 | 修正 |

### 実装ステップ
1. [ ] テスト作成（RED）
   - `test_ac1_xxx`: AC1のテスト
   - `test_ac2_xxx`: AC2のテスト
2. [ ] 実装（GREEN）
   - バックエンド: Rust API実装
   - フロントエンド: React UI実装
3. [ ] リファクタリング
4. [ ] 型定義の再生成（必要な場合）

### テスト方針
| 種別 | 対象 | スキル |
|------|------|--------|
| バックエンド | Rust API | `/backend-test` |
| フロントエンド | React UI | `/browser-test` |

### リスク・確認事項
- [ ] 既存機能への影響はないか
- [ ] パフォーマンスは問題ないか
- [ ] マイグレーションが必要か

---

**この計画で進めてよいですか？**
```
</output_format>

---

## 例

<example type="good">
<description>具体的なファイル、テスト方針、リスクが明確</description>
```markdown
## 実装計画: Issue #85 ページネーション追加

### 概要
タスク一覧APIにlimit/offsetパラメータを追加し、ページネーションを実現する。

### 変更ファイル
| ファイル | 変更内容 | 種別 |
|---------|---------|------|
| `crates/server/src/api/tasks.rs` | limit/offsetパラメータ追加 | 修正 |
| `crates/services/src/tasks.rs` | ページネーションロジック実装 | 修正 |
| `frontend/src/pages/ProjectTasks.tsx` | ページネーションUI追加 | 修正 |

### 実装ステップ
1. [ ] テスト作成（RED）
   - `test_ac1_pagination_limit`: limit指定で件数制限
   - `test_ac2_pagination_offset`: offset指定でスキップ
2. [ ] 実装（GREEN）
   - サービス層にページネーション追加
   - APIエンドポイント修正
   - フロントエンドUI追加
3. [ ] リファクタリング
4. [ ] 型定義の再生成

### テスト方針
| 種別 | 対象 | スキル |
|------|------|--------|
| バックエンド | タスクAPI | `/backend-test` |

### リスク・確認事項
- [ ] 既存のタスク一覧取得に影響がないか（デフォルト値設定）
- [ ] 大量データでのパフォーマンス

---

**この計画で進めてよいですか？**
```
</example>

<example type="bad">
<description>曖昧、ファイル不明、ユーザー承認なし</description>
```markdown
## 実装計画

ページネーションを追加します。
- APIを修正
- テストを書く

では実装を始めます。
```
</example>

---

## エラー時の対応

<error_handling>
| 状況 | 対応 |
|------|------|
| 調査結果が不十分 | explorerに戻って追加調査 |
| 実装方針が複数ある | `AskUserQuestion`で選択肢を提示 |
| 技術的に不明な点がある | 調査してから計画を提示 |
| ユーザーが計画を却下 | フィードバックを元に計画を修正 |
</error_handling>

---

## 重要

<important>
- **ユーザー承認必須**: 「この計画で進めてよいですか？」と必ず確認
- 承認なしに実装を開始しない
- 不明点があれば`AskUserQuestion`で確認してから計画確定
</important>

---

## 次のステップ

<next_agent>
ユーザー承認後 → **implementer** に引き継ぎ、TDD実装を開始
</next_agent>
